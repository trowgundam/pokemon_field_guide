using System.Text.RegularExpressions;

namespace PokemonFieldGuide.Services;

public sealed class GamePackage
{
    private readonly PackageManifest manifest;
    private readonly IReadOnlyList<GuideArea> areas;
    private readonly IReadOnlyList<PokedexEntry> pokedex;
    private readonly IReadOnlyList<GuideWorld> worlds;
    private readonly IReadOnlyDictionary<string, GuideArea> areasById;
    private readonly IReadOnlyDictionary<string, GuideWorld> worldsById;
    private readonly HashSet<string> outdoorAreaIds;

    internal GamePackage(
        GameDefinition definition,
        FieldGuideData fieldGuide,
        List<PokedexEntry> pokedex,
        List<GuideWorld> worlds,
        PackageManifest manifest)
    {
        Definition = definition;
        if (definition.Versions.Any(version => version.ProgressVersion < 1))
        {
            throw new InvalidOperationException($"The {definition.Name} package has an invalid progress version.");
        }

        areas = fieldGuide.Areas.AsReadOnly();
        this.pokedex = pokedex.AsReadOnly();
        this.worlds = worlds.AsReadOnly();
        if (manifest.FormatVersion != 2)
        {
            throw new InvalidOperationException($"The {definition.Name} package manifest format v{manifest.FormatVersion} is not supported.");
        }
        this.manifest = manifest;
        areasById = areas.ToDictionary(area => area.Id);
        worldsById = worlds.ToDictionary(world => world.Id);
        outdoorAreaIds =
        [
            .. worlds.SelectMany(world => world.Maps).Select(placement => NormalizeAreaId(placement.Id))
        ];
        DefaultWorld = worldsById[definition.DefaultWorldId];
        DefaultArea = Area(definition.DefaultAreaId) ?? areas.First();
    }

    public GameDefinition Definition { get; }
    public GuideArea DefaultArea { get; }
    public GuideWorld DefaultWorld { get; }
    public string PokemonFallback => $"{Definition.PokemonSpritePath}/question_mark.png";
    public string ItemFallback => $"{Definition.ItemSpritePath}/question_mark.png";

    public GuideArea? Area(string id) => areasById.GetValueOrDefault(NormalizeAreaId(id));

    public GuideWorld? World(string id) => worldsById.GetValueOrDefault(id);

    public GuideWorld? WorldForArea(string areaId)
    {
        var normalizedId = NormalizeAreaId(areaId);
        return worlds.FirstOrDefault(world => world.Maps.Any(map => NormalizeAreaId(map.Id) == normalizedId));
    }

    public bool IsOutdoor(string areaId) => outdoorAreaIds.Contains(NormalizeAreaId(areaId));

    public IReadOnlyList<GuideArea> AreasForWorld(string worldId) =>
        worldsById[worldId].Maps
            .Select(placement => Area(placement.Id))
            .OfType<GuideArea>()
            .OrderBy(area => NaturalKey(area.Name))
            .ToList();

    public IReadOnlyList<GuideArea> SearchAreas(string search, string versionId)
    {
        var term = search.Trim();
        bool Matches(string? value) => value?.Contains(term, StringComparison.OrdinalIgnoreCase) == true;

        return areas
            .Where(area => area.MapImage is not null &&
                (Matches(area.Name)
                 || Matches(area.Region)
                 || area.Items.Any(item => Matches(item.Name) || Matches(item.Kind))
                 || EncountersFor(area, versionId).Any(encounter => Matches(encounter.Species) || Matches(encounter.Method))
                 || SpecialPokemonFor(area, versionId).Any(mon => Matches(mon.Species) || Matches(mon.Kind) || Matches(mon.RequestedSpecies))
                 || area.Entrances.Any(entrance => Matches(entrance.Name))))
            .OrderBy(area => NaturalKey(area.Name))
            .ToList();
    }

    public IReadOnlyList<DisplayEntrance> RelevantEntrances(GuideArea area)
    {
        var resolved = area.Entrances
            .Select(entrance => (Warp: entrance, Target: ResolveRelevantTarget(area.Id, entrance.TargetId)))
            .Where(pair => pair.Target is not null)
            .Select(pair => new DisplayEntrance(pair.Target!.Id, pair.Target.Name, pair.Warp.X, pair.Warp.Y))
            .ToList();
        var clustered = new List<DisplayEntrance>();

        foreach (var targetGroup in resolved.GroupBy(entrance => entrance.TargetId))
        {
            var remaining = targetGroup.ToList();
            while (remaining.Count > 0)
            {
                var cluster = new List<DisplayEntrance> { remaining[0] };
                remaining.RemoveAt(0);
                for (var index = 0; index < cluster.Count; index++)
                {
                    for (var candidate = remaining.Count - 1; candidate >= 0; candidate--)
                    {
                        if (Math.Abs(cluster[index].X - remaining[candidate].X) > 1
                            || Math.Abs(cluster[index].Y - remaining[candidate].Y) > 1)
                        {
                            continue;
                        }

                        cluster.Add(remaining[candidate]);
                        remaining.RemoveAt(candidate);
                    }
                }

                clustered.Add(new DisplayEntrance(
                    targetGroup.Key,
                    cluster[0].Name,
                    cluster.Average(entrance => entrance.X),
                    cluster.Average(entrance => entrance.Y)));
            }
        }

        return clustered;
    }

    public IReadOnlyList<GuideArea> InteriorFloors(string startId)
    {
        var queue = new Queue<string>();
        var visited = new HashSet<string>();
        var floors = new List<GuideArea>();
        queue.Enqueue(startId);

        while (queue.Count > 0)
        {
            var id = queue.Dequeue();
            if (!visited.Add(id) || IsOutdoor(id))
            {
                continue;
            }

            var area = Area(id);
            if (area is null)
            {
                continue;
            }

            if (IsRelevant(area))
            {
                floors.Add(area);
            }

            foreach (var exit in area.Entrances)
            {
                if (!string.IsNullOrEmpty(exit.TargetId) && !visited.Contains(exit.TargetId))
                {
                    queue.Enqueue(exit.TargetId);
                }
            }
        }

        return floors.OrderBy(area => NaturalKey(area.Name)).ToList();
    }

    public IReadOnlyList<EncounterGroup> EncounterGroups(GuideArea area, string versionId) =>
        EncountersFor(area, versionId)
            .GroupBy(encounter => encounter.Type)
            .OrderBy(group => group.Key.Presentation().Order)
            .Select(group => new EncounterGroup(group.Key.Presentation().DisplayName, group.ToList()))
            .ToList();

    public IReadOnlyList<ItemGroup> ItemGroups(GuideArea area) =>
        area.Items
            .GroupBy(item => item.Kind)
            .OrderBy(group => ItemGroupOrder(group.Key))
            .Select(group => new ItemGroup(group.Key, group.ToList()))
            .ToList();

    public IReadOnlyList<SpecialPokemonGroup> SpecialPokemonGroups(GuideArea area, string versionId) =>
        SpecialPokemonFor(area, versionId)
            .GroupBy(mon => mon.Kind)
            .OrderBy(group => SpecialGroupOrder(group.Key))
            .Select(group => new SpecialPokemonGroup(group.Key, group.ToList()))
            .ToList();

    public AreaChecklist AreaChecklist(GuideArea area, string versionId) => new(
        EncountersFor(area, versionId)
            .Select(encounter => encounter.SpeciesId)
            .Concat(SpecialPokemonFor(area, versionId).Select(mon => mon.SpeciesId))
            .ToHashSet(),
        area.Items.Select(item => item.Id).ToHashSet());

    public IReadOnlyList<PokedexResult> SearchPokedex(string dexModeId, string versionId, string search)
    {
        var mode = Definition.DexModes.FirstOrDefault(candidate => candidate.Id == dexModeId) ?? Definition.DexModes[0];
        var term = search.Trim();

        return pokedex
            .Where(entry => !mode.Regional || entry.RegionalNumber.HasValue)
            .Select(entry => new PokedexResult(
                entry,
                mode.Regional ? entry.RegionalNumber ?? entry.Number : entry.Number,
                entry.Availability.GetValueOrDefault(versionId, "Trade / transfer required")))
            .Where(result => string.IsNullOrWhiteSpace(search)
                || result.Entry.Name.Contains(search, StringComparison.OrdinalIgnoreCase)
                || result.Number.ToString().Contains(term))
            .ToList();
    }

    public string PokemonIcon(string speciesId) => manifest.PokemonSprites.TryGetValue(speciesId, out var fileName)
        ? $"{Definition.PokemonSpritePath}/{fileName}"
        : PokemonFallback;

    public string ItemIcon(GuideItem item) => $"{Definition.ItemSpritePath}/{item.Icon}";

    private IEnumerable<Encounter> EncountersFor(GuideArea area, string versionId) =>
        area.Encounters.Where(encounter => encounter.Version == "Both" || encounter.Version == versionId);

    private IEnumerable<SpecialPokemon> SpecialPokemonFor(GuideArea area, string versionId) =>
        area.SpecialPokemon.Where(mon => mon.Version == "Both" || mon.Version == versionId);

    private GuideArea? ResolveRelevantTarget(string sourceId, string targetId)
    {
        var queue = new Queue<string>();
        var visited = new HashSet<string> { sourceId };
        if (!string.IsNullOrEmpty(targetId))
        {
            queue.Enqueue(targetId);
        }

        while (queue.Count > 0)
        {
            var id = queue.Dequeue();
            if (!visited.Add(id))
            {
                continue;
            }

            var area = Area(id);
            if (area is null || IsOutdoor(id))
            {
                continue;
            }

            if (IsRelevant(area))
            {
                return area;
            }

            foreach (var exit in area.Entrances)
            {
                if (!visited.Contains(exit.TargetId))
                {
                    queue.Enqueue(exit.TargetId);
                }
            }
        }

        return null;
    }

    private string NormalizeAreaId(string id) => manifest.AreaAliases.GetValueOrDefault(id, id);

    private static int SpecialGroupOrder(string kind) => kind switch
    {
        "Static" => 0,
        "Gift" => 1,
        "Trade" => 2,
        _ => 3
    };

    private static int ItemGroupOrder(string kind) => kind switch
    {
        "Visible" => 0,
        "Hidden" => 1,
        "Event" => 2,
        _ => 3
    };

    private static bool IsRelevant(GuideArea area) =>
        area.Items.Count + area.SpecialPokemon.Count + area.Encounters.Count > 0;

    private static string NaturalKey(string name) =>
        Regex.Replace(name.ToUpperInvariant(), @"\d+", match => int.Parse(match.Value).ToString("D8"));
}

public sealed record DisplayEntrance(string TargetId, string Name, double X, double Y);
public sealed record EncounterGroup(string Name, IReadOnlyList<Encounter> Encounters);
public sealed record ItemGroup(string Kind, IReadOnlyList<GuideItem> Items);
public sealed record SpecialPokemonGroup(string Kind, IReadOnlyList<SpecialPokemon> Pokemon);
public sealed record PokedexResult(PokedexEntry Entry, int Number, string Availability);
public sealed record AreaChecklist(IReadOnlySet<string> SpeciesIds, IReadOnlySet<string> ItemIds);

public sealed record EncounterTypePresentation(string DisplayName, int Order);

public static class EncounterTypeExtensions
{
    public static EncounterTypePresentation Presentation(this EncounterType type) => type switch
    {
        EncounterType.Random => new("Random encounters", 0),
        EncounterType.Surfing => new("Surfing", 1),
        EncounterType.OldRod => new("Fishing · Old Rod", 2),
        EncounterType.GoodRod => new("Fishing · Good Rod", 3),
        EncounterType.SuperRod => new("Fishing · Super Rod", 4),
        EncounterType.Roaming => new("Roaming encounters", 5),
        EncounterType.RockSmash => new("Rock Smash", 6),
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "The encounter type has no presentation metadata.")
    };
}