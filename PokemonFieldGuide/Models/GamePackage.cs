namespace PokemonFieldGuide.Models;

public sealed class GameCatalog
{
    public string DefaultGameId { get; set; } = "";
    public List<GameDefinition> Games { get; set; } = [];
}

public sealed class GameDefinition
{
    public string Id { get; set; } = "";
    public string Rules { get; set; } = "";
    public string Name { get; set; } = "";
    public string ShortName { get; set; } = "";
    public string PageTitle { get; set; } = "";
    public string AtlasTitle { get; set; } = "";
    public string LoadingLabel { get; set; } = "";
    public string DataPath { get; set; } = "";
    public string PokedexPath { get; set; } = "";
    public string WorldsPath { get; set; } = "";
    public string PokemonSpritePath { get; set; } = "";
    public string ItemSpritePath { get; set; } = "";
    public string DefaultAreaId { get; set; } = "";
    public string DefaultWorldId { get; set; } = "";
    public List<GameVersionDefinition> Versions { get; set; } = [];
    public List<GameRegionDefinition> Regions { get; set; } = [];
    public List<DexModeDefinition> DexModes { get; set; } = [];
}

public sealed class GameVersionDefinition
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public int ProgressVersion { get; set; } = 1;
    public string Accent { get; set; } = "#ef4b43";
    public string AccentSoft { get; set; } = "#5a2928";
}

public sealed class GameRegionDefinition
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string WorldId { get; set; } = "";
}

public sealed class DexModeDefinition
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Regional { get; set; }
}

public sealed record LoadedGamePackage(
    GameDefinition Definition,
    FieldGuideData FieldGuide,
    List<PokedexEntry> Pokedex,
    List<GuideWorld> Worlds);
