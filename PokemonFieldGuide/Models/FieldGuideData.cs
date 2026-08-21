using System.Text.Json.Serialization;

namespace PokemonFieldGuide.Models;

public sealed class FieldGuideData
{
    public string Source { get; set; } = "";
    public string Generated { get; set; } = "";
    public List<GuideArea> Areas { get; set; } = [];
}

public sealed class GuideArea
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Region { get; set; } = "";
    public List<Encounter> Encounters { get; set; } = [];
    public List<GuideItem> Items { get; set; } = [];
    public List<SpecialPokemon> SpecialPokemon { get; set; } = [];
    public List<MapEntrance> Entrances { get; set; } = [];
    public string? MapImage { get; set; }
    public int MapWidth { get; set; }
    public int MapHeight { get; set; }
}

public sealed class MapEntrance
{
    public string Id { get; set; } = "";
    public string TargetId { get; set; } = "";
    public string Name { get; set; } = "";
    public int X { get; set; }
    public int Y { get; set; }
}

public sealed class Encounter
{
    public string Species { get; set; } = "";
    public string SpeciesId { get; set; } = "";
    public int MinLevel { get; set; }
    public int MaxLevel { get; set; }
    public double Chance { get; set; }
    public string Method { get; set; } = "";
    public string Version { get; set; } = "Both";
}

public sealed class GuideItem
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Icon { get; set; } = "question_mark.png";
    public int X { get; set; }
    public int Y { get; set; }
    public int Quantity { get; set; }
}

public sealed class SpecialPokemon
{
    public string Id { get; set; } = "";
    public string Species { get; set; } = "";
    public string SpeciesId { get; set; } = "";
    public int Level { get; set; }
    public string Kind { get; set; } = "";
    public string Version { get; set; } = "Both";
    public string? RequestedSpecies { get; set; }
}

public sealed class SavedProgress
{
    public const int CurrentFormatVersion = 1;

    public int FormatVersion { get; set; }
    public string GameId { get; set; } = "frlg";
    public string Version { get; set; } = "FireRed";
    public string Theme { get; set; } = "Dark";
    public bool AnimationsEnabled { get; set; } = true;
    public string DexMode { get; set; } = "Normal";
    public string Accent { get; set; } = "#ef4b43";
    public Dictionary<string, string> SelectedVersions { get; set; } = [];
    public Dictionary<string, string> SelectedDexModes { get; set; } = [];
    public Dictionary<string, VersionProgress> Profiles { get; set; } = [];
    public Dictionary<string, int> ProfileVersions { get; set; } = [];
}

public sealed class VersionProgress
{
    public HashSet<string> Caught { get; set; } = [];
    public HashSet<string> Collected { get; set; } = [];
    public HashSet<string> CompletedSpecial { get; set; } = [];
}

public sealed class PokedexEntry
{
    public int Number { get; set; }
    public int? RegionalNumber { get; set; }
    public string Name { get; set; } = "";
    public string SpeciesId { get; set; } = "";
    public Dictionary<string, string> Availability { get; set; } = [];
}

public sealed class GuideWorld
{
    public string Id { get; set; } = "";
    public string Image { get; set; } = "";
    public int Width { get; set; }
    public int Height { get; set; }
    public List<WorldMapPlacement> Maps { get; set; } = [];
}

public sealed class WorldMapPlacement
{
    public string Id { get; set; } = "";
    public int X { get; set; }
    public int Y { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public int MarkerOffsetX { get; set; }
    public int MarkerOffsetY { get; set; }
}
