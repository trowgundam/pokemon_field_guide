using System.Text.RegularExpressions;

namespace PokemonFieldGuide.Services;

public sealed class GamePackage
{
    private readonly PackageManifestData manifest;
    private readonly IReadOnlyList<GuideArea> areas;
    private readonly IReadOnlyList<PokedexEntry> pokedex;
    private readonly IReadOnlyList<GuideWorld> worlds;
    private readonly IReadOnlyDictionary<string, GuideArea> areasById;
    private readonly IReadOnlyDictionary<string, GuideWorld> worldsById;
    private readonly HashSet<string> outdoorAreaIds;
    private readonly Dictionary<string, IReadOnlySet<string>> reachableAreaIdsByVersion = [];

    internal GamePackage(
        GameDefinition definition,
        FieldGuideData fieldGuide,
        List<PokedexEntry> pokedex,
        List<GuideWorld> worlds,
        PackageManifest manifest)
        : this(definition, fieldGuide, pokedex, worlds, PackageManifestData.From(manifest))
    {
    }

    internal GamePackage(
        GameDefinition definition,
        FieldGuideData fieldGuide,
        List<PokedexEntry> pokedex,
        List<GuideWorld> worlds,
        PackageManifestData manifest)
    {
        Definition = definition;
        if (definition.Versions.Any(version => version.ProgressVersion < 1))
        {
            throw new InvalidOperationException($"The {definition.Name} package has an invalid progress version.");
        }

        areas = fieldGuide.Areas.AsReadOnly();
        this.pokedex = pokedex.AsReadOnly();
        this.worlds = worlds.AsReadOnly();
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

    public string WorldName(GuideWorld world) =>
        world.Name
        ?? Definition.Regions.FirstOrDefault(region => region.WorldId == world.Id)?.Name
        ?? world.Id;

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
            .Where(area => ReachableAreaIds(versionId).Contains(area.Id)
                && area.MapImage is not null &&
                (Matches(area.Name)
                 || Matches(area.Region)
                 || ItemsFor(area, versionId).Any(item => Matches(item.Name) || Matches(item.Kind))
                 || area.Resources.Any(resource => Matches(resource.Name)
                     || Matches(resource.Kind)
                     || Matches(resource.Comment)
                     || resource.Rewards.Any(reward => Matches(reward.Name) || Matches(reward.Comment)))
                 || EncountersFor(area, versionId).Any(encounter => Matches(encounter.Species) || Matches(encounter.Method))
                 || SpecialPokemonFor(area, versionId).Any(mon => Matches(mon.Species) || Matches(mon.Kind) || Matches(mon.RequestedSpecies))
                 || EntrancesFor(area, versionId).Any(entrance => Matches(entrance.Name))
                 || TransportsFor(area, versionId).Any(transport =>
                     Matches(transport.Name)
                     || transport.Destinations.Any(destination =>
                         Matches(destination.Name) || Matches(destination.Requirement)))))
            .OrderBy(area => NaturalKey(area.Name))
            .ToList();
    }

    public IReadOnlyList<DisplayEntrance> RelevantEntrances(GuideArea area) =>
        RelevantEntrances(area, Definition.Versions[0].Id);

    public IReadOnlyList<DisplayEntrance> RelevantEntrances(GuideArea area, string versionId)
    {
        var resolved = EntrancesFor(area, versionId)
            .Select(entrance => (Warp: entrance, Target: ResolveRelevantTarget(area.Id, entrance.TargetId, versionId)))
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

    public IReadOnlyList<GuideArea> InteriorFloors(string startId) =>
        InteriorFloors(startId, Definition.Versions[0].Id);

    public IReadOnlyList<GuideArea> InteriorFloors(string startId, string versionId)
    {
        if (!ReachableAreaIds(versionId).Contains(NormalizeAreaId(startId)))
        {
            return [];
        }

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

            foreach (var exit in EntrancesFor(area, versionId))
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
        CollapseEquivalentTimeTables(EncountersFor(area, versionId))
            .OrderBy(table => table.Type.Presentation().Order)
            .ThenBy(table => ConditionOrder(table.Condition))
            .ThenBy(table => table.Condition, StringComparer.Ordinal)
            .Select(table => new EncounterGroup(
                table.Condition is null
                    ? table.Type.Presentation().DisplayName
                    : $"{table.Type.Presentation().DisplayName} · {table.Condition}",
                table.Encounters))
            .ToList();

    public IReadOnlyList<GuideItem> ItemsFor(GuideArea area, string versionId) =>
        area.Items.Where(item => item.Version == "Both" || item.Version == versionId).ToList();

    public IReadOnlyList<ItemGroup> ItemGroups(GuideArea area, string versionId) =>
        ItemsFor(area, versionId)
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
        ItemsFor(area, versionId).Select(item => item.Id).ToHashSet());

    public AreaMapDescriptor? AreaMap(GuideArea area, string versionId)
    {
        var areaId = NormalizeAreaId(area.Id);
        if (manifest.AreaMapsByVersion.GetValueOrDefault(versionId)?.GetValueOrDefault(areaId) is { } versionMap)
        {
            return versionMap;
        }

        return area.MapImage is null
            ? null
            : new AreaMapDescriptor { Image = area.MapImage, Width = area.MapWidth, Height = area.MapHeight };
    }

    public IReadOnlyList<DisplayTransport> TransportsFor(GuideArea area, string versionId) =>
        area.Transports
            .Select(transport => new DisplayTransport(
                transport.Id,
                transport.Name,
                transport.X,
                transport.Y,
                transport.Destinations
                    .Where(destination => destination.Version == "Both" || destination.Version == versionId)
                    .Select(destination => new DisplayTransportDestination(
                        destination.Id,
                        destination.Name,
                        NormalizeAreaId(destination.TargetId),
                        destination.Requirement))
                    .ToList()))
            .Where(transport => transport.Destinations.Count > 0)
            .ToList();

    public IReadOnlyList<DisplayTravelMarker> TravelMarkersFor(GuideArea area, string versionId) =>
        TransportsFor(area, versionId)
            .Select<DisplayTransport, DisplayTravelMarker>(transport => transport.Destinations.Count == 1
                ? new DirectTravelMarker(transport.Id, transport.Name, transport.X, transport.Y, transport.Destinations[0])
                : new TransportChoiceMarker(transport.Id, transport.Name, transport.X, transport.Y, transport.Destinations))
            .ToList();

    public GuideArea? NavigableArea(string id, string versionId)
    {
        var normalizedId = NormalizeAreaId(id);
        return ReachableAreaIds(versionId).Contains(normalizedId) ? Area(normalizedId) : null;
    }

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

    public string PokemonIcon(string speciesId, string versionId)
    {
        if (manifest.PokemonSpritesByVersion.GetValueOrDefault(versionId)?.GetValueOrDefault(speciesId) is { } versionFileName)
        {
            return $"{Definition.PokemonSpritePath}/{versionFileName}";
        }

        return manifest.PokemonSprites.TryGetValue(speciesId, out var fileName)
            ? $"{Definition.PokemonSpritePath}/{fileName}"
            : PokemonFallback;
    }

    public string ItemIcon(GuideItem item) => $"{Definition.ItemSpritePath}/{item.Icon}";

    private IEnumerable<Encounter> EncountersFor(GuideArea area, string versionId) =>
        area.Encounters.Where(encounter => encounter.Version == "Both" || encounter.Version == versionId);

    private IEnumerable<SpecialPokemon> SpecialPokemonFor(GuideArea area, string versionId) =>
        area.SpecialPokemon.Where(mon => mon.Version == "Both" || mon.Version == versionId);

    private GuideArea? ResolveRelevantTarget(string sourceId, string targetId, string versionId)
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

            foreach (var exit in EntrancesFor(area, versionId))
            {
                if (!visited.Contains(exit.TargetId))
                {
                    queue.Enqueue(exit.TargetId);
                }
            }
        }

        return null;
    }

    private IEnumerable<MapEntrance> EntrancesFor(GuideArea area, string versionId) =>
        area.Entrances.Where(entrance => entrance.Version == "Both" || entrance.Version == versionId);

    private IReadOnlySet<string> ReachableAreaIds(string versionId)
    {
        if (reachableAreaIdsByVersion.TryGetValue(versionId, out var cached))
        {
            return cached;
        }

        var reachable = new HashSet<string>();
        var enteredWorlds = new HashSet<string>();
        var queue = new Queue<string>();

        void EnqueueArea(string id)
        {
            var normalizedId = NormalizeAreaId(id);
            if (reachable.Add(normalizedId))
            {
                queue.Enqueue(normalizedId);
            }
        }

        void EnterWorld(string worldId)
        {
            if (!enteredWorlds.Add(worldId) || !worldsById.TryGetValue(worldId, out var world))
            {
                return;
            }

            foreach (var placement in world.Maps)
            {
                EnqueueArea(placement.Id);
            }
        }

        EnterWorld(Definition.DefaultWorldId);
        foreach (var region in Definition.Regions)
        {
            EnterWorld(region.WorldId);
        }

        while (queue.Count > 0)
        {
            var area = Area(queue.Dequeue());
            if (area is null)
            {
                continue;
            }

            foreach (var entrance in EntrancesFor(area, versionId))
            {
                EnqueueArea(entrance.TargetId);
            }

            foreach (var transport in TransportsFor(area, versionId))
            {
                foreach (var destination in transport.Destinations)
                {
                    EnqueueArea(destination.TargetId);
                    var world = WorldForArea(destination.TargetId);
                    if (world is not null)
                    {
                        EnterWorld(world.Id);
                    }
                }
            }
        }

        reachableAreaIdsByVersion[versionId] = reachable;
        return reachable;
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
        area.IncludeInNavigation
        || area.Items.Count + area.Resources.Count + area.SpecialPokemon.Count + area.Encounters.Count + area.Transports.Count > 0;

    private static IReadOnlyList<EncounterTable> CollapseEquivalentTimeTables(IEnumerable<Encounter> encounters)
    {
        var tables = encounters
            .GroupBy(encounter => (encounter.Type, encounter.Condition))
            .Select(group =>
            {
                var timed = ParseTimedCondition(group.Key.Condition);
                return new EncounterTable(
                    group.Key.Type,
                    timed is null ? group.Key.Condition : timed.Prefix,
                    timed?.Times ?? EncounterTimes.None,
                    group.ToList());
            })
            .ToList();
        var collapsed = tables.Where(table => table.Times == EncounterTimes.None).ToList();

        foreach (var bucket in tables.Where(table => table.Times != EncounterTimes.None)
                     .GroupBy(table => (table.Type, table.Condition)))
        {
            var equivalent = new List<EncounterTable>();
            foreach (var table in bucket)
            {
                var existingIndex = equivalent.FindIndex(candidate => EncounterTablesEqual(candidate.Encounters, table.Encounters));
                if (existingIndex < 0)
                {
                    equivalent.Add(table);
                }
                else
                {
                    equivalent[existingIndex] = equivalent[existingIndex] with
                    {
                        Times = equivalent[existingIndex].Times | table.Times
                    };
                }
            }

            collapsed.AddRange(equivalent.Select(table => table with
            {
                Condition = table.Times == EncounterTimes.All
                    ? table.Condition
                    : JoinCondition(table.Condition, TimeLabel(table.Times))
            }));
        }

        return collapsed;
    }

    private static bool EncounterTablesEqual(IReadOnlyList<Encounter> left, IReadOnlyList<Encounter> right) =>
        EncounterSlots(left).SequenceEqual(EncounterSlots(right));

    private static IEnumerable<EncounterSlot> EncounterSlots(IEnumerable<Encounter> encounters) =>
        encounters
            .Select(encounter => new EncounterSlot(
                encounter.SpeciesId,
                encounter.Method,
                encounter.MinLevel,
                encounter.MaxLevel,
                encounter.Chance))
            .OrderBy(slot => slot.SpeciesId, StringComparer.Ordinal)
            .ThenBy(slot => slot.Method, StringComparer.Ordinal)
            .ThenBy(slot => slot.MinLevel)
            .ThenBy(slot => slot.MaxLevel)
            .ThenBy(slot => slot.Chance);

    private static TimedCondition? ParseTimedCondition(string? condition)
    {
        if (condition is null)
        {
            return null;
        }

        var separator = condition.LastIndexOf(" · ", StringComparison.Ordinal);
        var prefix = separator < 0 ? null : condition[..separator];
        var timeText = separator < 0 ? condition : condition[(separator + 3)..];
        var times = EncounterTimes.None;
        foreach (var part in timeText.Split(" / ", StringSplitOptions.None))
        {
            var time = part switch
            {
                "Morning" => EncounterTimes.Morning,
                "Day" => EncounterTimes.Day,
                "Night" => EncounterTimes.Night,
                _ => EncounterTimes.None
            };
            if (time == EncounterTimes.None)
            {
                return null;
            }
            times |= time;
        }

        return new TimedCondition(prefix, times);
    }

    private static string TimeLabel(EncounterTimes times) => string.Join(" / ", new[]
    {
        (EncounterTimes.Morning, "Morning"),
        (EncounterTimes.Day, "Day"),
        (EncounterTimes.Night, "Night")
    }.Where(entry => times.HasFlag(entry.Item1)).Select(entry => entry.Item2));

    private static string JoinCondition(string? prefix, string suffix) =>
        prefix is null ? suffix : $"{prefix} · {suffix}";

    private static int ConditionOrder(string? condition)
    {
        if (condition is null)
        {
            return 0;
        }

        var times = ParseTimedCondition(condition)?.Times ?? EncounterTimes.None;
        if (times.HasFlag(EncounterTimes.Morning)) return 1;
        if (times.HasFlag(EncounterTimes.Day)) return 2;
        if (times.HasFlag(EncounterTimes.Night)) return 3;
        return 4;
    }

    private static string NaturalKey(string name) =>
        Regex.Replace(name.ToUpperInvariant(), @"\d+", match => int.Parse(match.Value).ToString("D8"));

    [Flags]
    private enum EncounterTimes
    {
        None = 0,
        Morning = 1,
        Day = 2,
        Night = 4,
        All = Morning | Day | Night
    }

    private sealed record TimedCondition(string? Prefix, EncounterTimes Times);
    private sealed record EncounterTable(EncounterType Type, string? Condition, EncounterTimes Times, IReadOnlyList<Encounter> Encounters);
    private sealed record EncounterSlot(string SpeciesId, string Method, int MinLevel, int MaxLevel, double Chance);
}

public sealed record DisplayEntrance(string TargetId, string Name, double X, double Y);
public sealed record DisplayTransport(
    string Id,
    string Name,
    double X,
    double Y,
    IReadOnlyList<DisplayTransportDestination> Destinations);
public sealed record DisplayTransportDestination(string Id, string Name, string TargetId, string? Requirement);
public abstract record DisplayTravelMarker(string Id, string Name, double X, double Y);
public sealed record DirectTravelMarker(
    string Id,
    string Name,
    double X,
    double Y,
    DisplayTransportDestination Destination) : DisplayTravelMarker(Id, Name, X, Y);
public sealed record TransportChoiceMarker(
    string Id,
    string Name,
    double X,
    double Y,
    IReadOnlyList<DisplayTransportDestination> Destinations) : DisplayTravelMarker(Id, Name, X, Y);
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
        EncounterType.Underwater => new("Underwater", 2),
        EncounterType.OldRod => new("Fishing · Old Rod", 3),
        EncounterType.GoodRod => new("Fishing · Good Rod", 4),
        EncounterType.SuperRod => new("Fishing · Super Rod", 5),
        EncounterType.Roaming => new("Roaming encounters", 6),
        EncounterType.RockSmash => new("Rock Smash", 7),
        EncounterType.Headbutt => new("Headbutt", 8),
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "The encounter type has no presentation metadata.")
    };
}
