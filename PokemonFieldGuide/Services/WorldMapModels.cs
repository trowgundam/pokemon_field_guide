using System.Text.Json;

namespace PokemonFieldGuide.Services;

public readonly record struct MapCoordinate(int X, int Y);
public readonly record struct CanvasPoint(double X, double Y);
public sealed record WorldPolygon(IReadOnlyList<CanvasPoint> Points);
internal readonly record struct WorldBoundaryEdge(CanvasPoint Start, CanvasPoint End);

internal static class WorldAreaBoundary
{
    public static IReadOnlyList<WorldBoundaryEdge> ExteriorEdges(IEnumerable<WorldPolygon> regions)
    {
        var edges = new Dictionary<EdgeKey, (WorldBoundaryEdge Edge, int Count)>();

        foreach (var region in regions)
        {
            for (var index = 0; index < region.Points.Count; index++)
            {
                var start = region.Points[index];
                var end = region.Points[(index + 1) % region.Points.Count];
                if (start == end) continue;

                var edge = new WorldBoundaryEdge(start, end);
                var key = EdgeKey.Create(start, end);
                edges[key] = edges.TryGetValue(key, out var existing)
                    ? (existing.Edge, existing.Count + 1)
                    : (edge, 1);
            }
        }

        return edges.Values
            .Where(entry => entry.Count % 2 == 1)
            .Select(entry => entry.Edge)
            .ToList();
    }

    private readonly record struct EdgeKey(CanvasPoint First, CanvasPoint Second)
    {
        public static EdgeKey Create(CanvasPoint start, CanvasPoint end) => Compare(start, end) <= 0
            ? new(start, end)
            : new(end, start);

        private static int Compare(CanvasPoint left, CanvasPoint right)
        {
            var xComparison = left.X.CompareTo(right.X);
            return xComparison != 0 ? xComparison : left.Y.CompareTo(right.Y);
        }
    }
}

public abstract record WorldRendering(int Width, int Height);
public sealed record FlatWorldRendering(string Image, int Width, int Height) : WorldRendering(Width, Height);
public sealed record LayeredWorldRenderingModel(
    string OverviewImage,
    int Width,
    int Height,
    IReadOnlyList<WorldLayerModel> Layers) : WorldRendering(Width, Height);
public sealed record WorldLayerModel(
    string Id,
    string Image,
    int X,
    int Y,
    int Width,
    int Height,
    int Order,
    double MinScale);

public sealed class WorldDefinition
{
    private readonly IReadOnlyDictionary<string, WorldAreaProjection> areasById;

    internal WorldDefinition(string id, string? name, WorldRendering rendering, IReadOnlyList<WorldAreaProjection> areas)
    {
        Id = id;
        Name = name;
        Rendering = rendering;
        Areas = areas;
        areasById = areas.ToDictionary(area => area.AreaId);
    }

    public string Id { get; }
    public string? Name { get; }
    internal WorldRendering Rendering { get; }
    internal IReadOnlyList<WorldAreaProjection> Areas { get; }
    public IReadOnlySet<string> AreaIds => areasById.Keys.ToHashSet();

    internal CanvasPoint Project(string areaId, int x, int y) => areasById[areaId].Project(new(x, y));

    internal CanvasPoint Project(string areaId, IReadOnlyList<MapCoordinate> coordinates)
    {
        var points = coordinates.Select(areasById[areaId].Project).ToList();
        if (points.Count == 0) throw new InvalidOperationException($"No source coordinates were supplied for {areaId}.");
        return new(points.Average(point => point.X), points.Average(point => point.Y));
    }
}

internal sealed class WorldAreaProjection(
    string areaId,
    IReadOnlyList<WorldPolygon> regions,
    Func<MapCoordinate, CanvasPoint> project)
{
    public string AreaId { get; } = areaId;
    public IReadOnlyList<WorldPolygon> Regions { get; } = regions;
    public CanvasPoint Project(MapCoordinate coordinate) => project(coordinate);
}

internal static class WorldDocumentReader
{
    public static IReadOnlyList<WorldDefinition> Read(JsonElement root)
    {
        if (root.ValueKind == JsonValueKind.Array)
        {
            var worlds = root.Deserialize<List<GuideWorld>>(PokemonFieldGuideJson.Options)
                ?? throw new InvalidOperationException("The legacy worlds document could not be loaded.");
            return FromLegacy(worlds);
        }

        var document = root.Deserialize<WorldsDocumentV2>(PokemonFieldGuideJson.Options)
            ?? throw new InvalidOperationException("The layered worlds document could not be loaded.");
        if (document.FormatVersion != 2)
            throw new InvalidOperationException($"World format v{document.FormatVersion} is not supported.");
        return document.Worlds.Select(FromLayered).ToList();
    }

    public static IReadOnlyList<WorldDefinition> FromLegacy(IEnumerable<GuideWorld> worlds) =>
        worlds.Select(world => new WorldDefinition(
            world.Id,
            world.Name,
            new FlatWorldRendering(world.Image, world.Width, world.Height),
            world.Maps.Select(placement =>
            {
                var areaId = placement.Id;
                var regions = new[] { new WorldPolygon([
                    new(placement.X, placement.Y),
                    new(placement.X + placement.Width, placement.Y),
                    new(placement.X + placement.Width, placement.Y + placement.Height),
                    new(placement.X, placement.Y + placement.Height)
                ]) };
                return new WorldAreaProjection(areaId, regions, coordinate => new(
                    placement.X + (coordinate.X - placement.MarkerOffsetX) * 16 + 8,
                    placement.Y + (coordinate.Y - placement.MarkerOffsetY) * 16 + 8));
            }).ToList())).ToList();

    private static WorldDefinition FromLayered(LayeredGuideWorld world)
    {
        var rendering = new LayeredWorldRenderingModel(
            world.Rendering.OverviewImage,
            world.Rendering.Width,
            world.Rendering.Height,
            world.Rendering.Layers.OrderBy(layer => layer.Order).Select(layer => new WorldLayerModel(
                layer.Id, layer.Image, layer.X, layer.Y, layer.Width, layer.Height, layer.Order, layer.MinScale)).ToList());
        var areas = world.Areas.Select(area =>
        {
            var anchors = area.Anchors.ToDictionary(anchor => new MapCoordinate(anchor.TileX, anchor.TileY), anchor => new CanvasPoint(anchor.X, anchor.Y));
            return new WorldAreaProjection(
                area.Id,
                area.Regions.Select(region => new WorldPolygon(region.Points.Select(point => new CanvasPoint(point.X, point.Y)).ToList())).ToList(),
                coordinate => anchors.TryGetValue(coordinate, out var point)
                    ? point
                    : throw new InvalidOperationException($"No generated world anchor exists for {area.Id} at ({coordinate.X}, {coordinate.Y})."));
        }).ToList();
        return new(world.Id, world.Name, rendering, areas);
    }
}

public sealed record WorldMapModel(
    string Id,
    string Name,
    WorldRendering Rendering,
    IReadOnlyList<WorldAreaModel> Areas,
    IReadOnlyList<WorldMapMarker> Markers);
public sealed record WorldAreaModel(GuideArea Area, IReadOnlyList<WorldPolygon> Regions);

public abstract record WorldMapMarker(GuideArea Area, string Label, double X, double Y);
public sealed record WorldItemMarker(GuideArea Area, GuideItem Item, double X, double Y)
    : WorldMapMarker(Area, Item.Name, X, Y);
public sealed record WorldResourceMarker(GuideArea Area, GuideMapResource Resource, double X, double Y)
    : WorldMapMarker(Area, Resource.Name, X, Y);
public sealed record WorldEntranceMarker(GuideArea Area, DisplayEntrance Entrance, double X, double Y)
    : WorldMapMarker(Area, Entrance.Name, X, Y);
public sealed record WorldTravelMarker(GuideArea Area, DisplayTravelMarker Travel, double X, double Y)
    : WorldMapMarker(Area, Travel.Name, X, Y);

public abstract record WorldMapAction;
public sealed record SelectWorldAreaAction(GuideArea Area) : WorldMapAction;
public sealed record InspectWorldItemAction(GuideArea Area, GuideItem Item) : WorldMapAction;
public sealed record InspectWorldResourceAction(GuideArea Area, GuideMapResource Resource) : WorldMapAction;
public sealed record EnterWorldLocationAction(string TargetId) : WorldMapAction;
public sealed record UseWorldTransportAction(DisplayTravelMarker Travel) : WorldMapAction;
