using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PokemonFieldGuide.Shared.Contracts;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class FieldGuideData
{
    [JsonRequired] public string Source { get; set; } = "";
    [JsonRequired] public string Generated { get; set; } = "";
    [JsonRequired] public List<GuideArea> Areas { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class GuideArea
{
    [JsonRequired] public string Id { get; set; } = "";
    [JsonRequired] public string Name { get; set; } = "";
    [JsonRequired] public string Region { get; set; } = "";
    [JsonRequired] public List<Encounter> Encounters { get; set; } = [];
    [JsonRequired] public List<GuideItem> Items { get; set; } = [];
    public List<GuideMapResource> Resources { get; set; } = [];
    [JsonRequired] public List<SpecialPokemon> SpecialPokemon { get; set; } = [];
    [JsonRequired] public List<MapEntrance> Entrances { get; set; } = [];
    public List<GuideTransport> Transports { get; set; } = [];
    public bool IncludeInNavigation { get; set; }
    public string? MapImage { get; set; }
    public List<WorldMarkerAnchor> MapAnchors { get; set; } = [];
    [JsonRequired, Range(0, int.MaxValue)] public int MapWidth { get; set; }
    [JsonRequired, Range(0, int.MaxValue)] public int MapHeight { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class GuideMapResource
{
    [JsonRequired, MinLength(1)] public string Name { get; set; } = "";
    [JsonRequired, MinLength(1)] public string Kind { get; set; } = "";
    [JsonRequired] public int X { get; set; }
    [JsonRequired] public int Y { get; set; }
    [MinLength(1)]
    public string? Comment { get; set; }
    public List<GuideResourceReward> Rewards { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class GuideResourceReward
{
    [JsonRequired, MinLength(1)] public string Name { get; set; } = "";
    [JsonRequired, Range(1, int.MaxValue)] public int Quantity { get; set; }
    [Range(1, int.MaxValue)] public int? Weight { get; set; }
    [MinLength(1)]
    public string? Comment { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class MapEntrance
{
    [JsonRequired] public string Id { get; set; } = "";
    [JsonRequired] public string TargetId { get; set; } = "";
    [JsonRequired] public string Name { get; set; } = "";
    [JsonRequired] public int X { get; set; }
    [JsonRequired] public int Y { get; set; }
    public string Version { get; set; } = "Both";
    public bool ShowMarker { get; set; } = true;
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class GuideTransport
{
    [JsonRequired, MinLength(1)] public string Id { get; set; } = "";
    [JsonRequired, MinLength(1)] public string Name { get; set; } = "";
    [JsonRequired] public int X { get; set; }
    [JsonRequired] public int Y { get; set; }
    [JsonRequired] public List<GuideTransportDestination> Destinations { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class GuideTransportDestination
{
    [JsonRequired, MinLength(1)] public string Id { get; set; } = "";
    [JsonRequired, MinLength(1)] public string TargetId { get; set; } = "";
    [JsonRequired, MinLength(1)] public string Name { get; set; } = "";
    [JsonRequired, MinLength(1)] public string Version { get; set; } = "Both";
    [MinLength(1)] public string? Requirement { get; set; }
}

public enum EncounterType
{
    Random,
    Surfing,
    Underwater,
    OldRod,
    GoodRod,
    SuperRod,
    Roaming,
    RockSmash,
    Headbutt
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class Encounter
{
    [JsonRequired] public string Species { get; set; } = "";
    [JsonRequired] public string SpeciesId { get; set; } = "";
    [JsonRequired, Range(0, int.MaxValue)] public int MinLevel { get; set; }
    [JsonRequired, Range(0, int.MaxValue)] public int MaxLevel { get; set; }
    [JsonRequired, Range(double.Epsilon, 100)] public double Chance { get; set; }
    [JsonRequired] public string Method { get; set; } = "";
    public string? Condition { get; set; }
    [JsonRequired] public EncounterType Type { get; set; }
    [JsonRequired] public string Version { get; set; } = "Both";
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class GuideItem
{
    [JsonRequired] public string Id { get; set; } = "";
    [JsonRequired] public string Name { get; set; } = "";
    [JsonRequired] public string Kind { get; set; } = "";
    public string Version { get; set; } = "Both";
    [JsonRequired] public string Icon { get; set; } = "question_mark.png";
    [JsonRequired] public int X { get; set; }
    [JsonRequired] public int Y { get; set; }
    [JsonRequired, Range(1, int.MaxValue)] public int Quantity { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class SpecialPokemon
{
    [JsonRequired] public string Id { get; set; } = "";
    [JsonRequired] public string Species { get; set; } = "";
    [JsonRequired] public string SpeciesId { get; set; } = "";
    [JsonRequired, Range(0, int.MaxValue)] public int Level { get; set; }
    [JsonRequired] public string Kind { get; set; } = "";
    [JsonRequired] public string Version { get; set; } = "Both";
    public string? RequestedSpecies { get; set; }
    [MinLength(1)] public string? Note { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class PokedexEntry
{
    [JsonRequired, Range(1, int.MaxValue)] public int Number { get; set; }
    [Range(1, int.MaxValue)] public int? RegionalNumber { get; set; }
    [JsonRequired] public string Name { get; set; } = "";
    [JsonRequired] public string SpeciesId { get; set; } = "";
    [JsonRequired] public Dictionary<string, string> Availability { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class GuideWorld
{
    [JsonRequired] public string Id { get; set; } = "";
    [MinLength(1)] public string? Name { get; set; }
    [JsonRequired] public string Image { get; set; } = "";
    [JsonRequired, Range(1, int.MaxValue)] public int Width { get; set; }
    [JsonRequired, Range(1, int.MaxValue)] public int Height { get; set; }
    [JsonRequired] public List<WorldMapPlacement> Maps { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class WorldMapPlacement
{
    [JsonRequired] public string Id { get; set; } = "";
    [JsonRequired] public int X { get; set; }
    [JsonRequired] public int Y { get; set; }
    [JsonRequired, Range(1, int.MaxValue)] public int Width { get; set; }
    [JsonRequired, Range(1, int.MaxValue)] public int Height { get; set; }
    public int MarkerOffsetX { get; set; }
    public int MarkerOffsetY { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class WorldsDocumentV2
{
    [JsonRequired, Range(2, 2)] public int FormatVersion { get; set; } = 2;
    [JsonRequired, MinLength(1)] public List<LayeredGuideWorld> Worlds { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class LayeredGuideWorld
{
    [JsonRequired, MinLength(1)] public string Id { get; set; } = "";
    [MinLength(1)] public string? Name { get; set; }
    [JsonRequired] public LayeredWorldRendering Rendering { get; set; } = new();
    [JsonRequired, MinLength(1)] public List<WorldAreaGeometry> Areas { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class LayeredWorldRendering
{
    [JsonRequired, MinLength(1)] public string OverviewImage { get; set; } = "";
    [JsonRequired, Range(1, int.MaxValue)] public int Width { get; set; }
    [JsonRequired, Range(1, int.MaxValue)] public int Height { get; set; }
    [JsonRequired, MinLength(1)] public List<WorldRasterLayer> Layers { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class WorldRasterLayer
{
    [JsonRequired, MinLength(1)] public string Id { get; set; } = "";
    [JsonRequired, MinLength(1)] public string Image { get; set; } = "";
    [JsonRequired] public int X { get; set; }
    [JsonRequired] public int Y { get; set; }
    [JsonRequired, Range(1, int.MaxValue)] public int Width { get; set; }
    [JsonRequired, Range(1, int.MaxValue)] public int Height { get; set; }
    [JsonRequired] public int Order { get; set; }
    [JsonRequired, Range(double.Epsilon, 3)] public double MinScale { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class WorldAreaGeometry
{
    [JsonRequired, MinLength(1)] public string Id { get; set; } = "";
    [JsonRequired, MinLength(1)] public List<WorldHitRegion> Regions { get; set; } = [];
    [JsonRequired] public List<WorldMarkerAnchor> Anchors { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class WorldHitRegion
{
    [JsonRequired, MinLength(3)] public List<WorldCanvasPoint> Points { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class WorldMarkerAnchor
{
    [JsonRequired] public int TileX { get; set; }
    [JsonRequired] public int TileY { get; set; }
    [JsonRequired] public double X { get; set; }
    [JsonRequired] public double Y { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class WorldCanvasPoint
{
    [JsonRequired] public double X { get; set; }
    [JsonRequired] public double Y { get; set; }
}
