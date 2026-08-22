using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PokemonFieldGuide.Shared.Contracts;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class GameCatalog
{
    [JsonRequired] public string DefaultGameId { get; set; } = "";
    [JsonRequired] public List<GameDefinition> Games { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class GameDefinition
{
    [JsonRequired] public string Id { get; set; } = "";
    [JsonRequired] public string Name { get; set; } = "";
    [JsonRequired] public string ShortName { get; set; } = "";
    [JsonRequired] public string PageTitle { get; set; } = "";
    [JsonRequired] public string AtlasTitle { get; set; } = "";
    [JsonRequired] public string LoadingLabel { get; set; } = "";
    [JsonRequired] public string DataPath { get; set; } = "";
    [JsonRequired] public string PokedexPath { get; set; } = "";
    [JsonRequired] public string WorldsPath { get; set; } = "";
    [JsonRequired] public string PokemonSpritePath { get; set; } = "";
    [JsonRequired] public string ItemSpritePath { get; set; } = "";
    [JsonRequired] public string DefaultAreaId { get; set; } = "";
    [JsonRequired] public string DefaultWorldId { get; set; } = "";
    [JsonRequired] public List<GameVersionDefinition> Versions { get; set; } = [];
    [JsonRequired] public List<GameRegionDefinition> Regions { get; set; } = [];
    [JsonRequired] public List<DexModeDefinition> DexModes { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class GameVersionDefinition
{
    [JsonRequired] public string Id { get; set; } = "";
    [JsonRequired] public string Name { get; set; } = "";
    [JsonRequired, Range(1, int.MaxValue)] public int ProgressVersion { get; set; } = 1;
    [JsonRequired] public string Accent { get; set; } = "#ef4b43";
    [JsonRequired] public string AccentSoft { get; set; } = "#5a2928";
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class GameRegionDefinition
{
    [JsonRequired] public string Id { get; set; } = "";
    [JsonRequired] public string Name { get; set; } = "";
    [JsonRequired] public string WorldId { get; set; } = "";
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class DexModeDefinition
{
    [JsonRequired] public string Id { get; set; } = "";
    [JsonRequired] public string Name { get; set; } = "";
    [JsonRequired] public bool Regional { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class PackageManifest
{
    [JsonRequired, Range(2, 2)] public int FormatVersion { get; set; } = 2;
    [JsonRequired] public Dictionary<string, string> PokemonSprites { get; set; } = [];
    public Dictionary<string, Dictionary<string, string>> PokemonSpritesByVersion { get; set; } = [];
    [JsonRequired] public Dictionary<string, string> AreaAliases { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class PackageManifestV3
{
    [JsonRequired, Range(3, 3)] public int FormatVersion { get; set; } = 3;
    [JsonRequired] public Dictionary<string, string> PokemonSprites { get; set; } = [];
    public Dictionary<string, Dictionary<string, string>> PokemonSpritesByVersion { get; set; } = [];
    [JsonRequired] public Dictionary<string, string> AreaAliases { get; set; } = [];
    [JsonRequired] public Dictionary<string, Dictionary<string, AreaMapDescriptor>> AreaMapsByVersion { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class AreaMapDescriptor
{
    [JsonRequired, MinLength(1)] public string Image { get; set; } = "";
    [JsonRequired, Range(1, int.MaxValue)] public int Width { get; set; }
    [JsonRequired, Range(1, int.MaxValue)] public int Height { get; set; }
}
