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
    public bool IncludeInNavigation { get; set; }
    public string? MapImage { get; set; }
    [JsonRequired, Range(0, int.MaxValue)] public int MapWidth { get; set; }
    [JsonRequired, Range(0, int.MaxValue)] public int MapHeight { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class GuideMapResource
{
    [JsonRequired] public string Name { get; set; } = "";
    [JsonRequired] public string Kind { get; set; } = "";
    [JsonRequired] public int X { get; set; }
    [JsonRequired] public int Y { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class MapEntrance
{
    [JsonRequired] public string Id { get; set; } = "";
    [JsonRequired] public string TargetId { get; set; } = "";
    [JsonRequired] public string Name { get; set; } = "";
    [JsonRequired] public int X { get; set; }
    [JsonRequired] public int Y { get; set; }
}

public enum EncounterType
{
    Random,
    Surfing,
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
