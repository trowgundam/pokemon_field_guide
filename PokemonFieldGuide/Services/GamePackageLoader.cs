using System.Net.Http.Json;
using System.Text.Json;

namespace PokemonFieldGuide.Services;

internal sealed class GamePackageLoader(HttpClient http)
{
    public async Task<GameCatalog> LoadCatalogAsync() =>
        await http.GetFromJsonAsync<GameCatalog>("games/catalog.json", PokemonFieldGuideJson.Options)
        ?? throw new InvalidOperationException("The game catalog could not be loaded.");

    public async Task<GamePackage> LoadAsync(GameDefinition definition)
    {
        var fieldGuideTask = http.GetByteArrayAsync(definition.DataPath);
        var pokedexTask = http.GetByteArrayAsync(definition.PokedexPath);
        var worldsTask = http.GetByteArrayAsync(definition.WorldsPath);
        var manifestPath = $"{definition.DataPath[..(definition.DataPath.LastIndexOf('/') + 1)]}package-manifest.json";
        var manifestTask = http.GetByteArrayAsync(manifestPath);
        await Task.WhenAll(fieldGuideTask, pokedexTask, worldsTask, manifestTask);

        using var manifestDocument = JsonDocument.Parse(await manifestTask);
        var manifest = ReadManifest(definition, manifestDocument.RootElement);

        using var worldsDocument = JsonDocument.Parse(await worldsTask);
        return new GamePackage(
            definition,
            JsonSerializer.Deserialize<FieldGuideData>(await fieldGuideTask, PokemonFieldGuideJson.Options)
                ?? throw new InvalidOperationException($"Field-guide data for {definition.Name} could not be loaded."),
            JsonSerializer.Deserialize<List<PokedexEntry>>(await pokedexTask, PokemonFieldGuideJson.Options) ?? [],
            WorldDocumentReader.Read(worldsDocument.RootElement).ToList(),
            manifest);
    }

    internal static PackageManifestData ReadManifest(GameDefinition definition, JsonElement root)
    {
        if (!root.TryGetProperty("formatVersion", out var versionProperty)
            || !versionProperty.TryGetInt32(out var formatVersion))
        {
            throw new InvalidOperationException($"The {definition.Name} package manifest has no valid format version.");
        }

        return formatVersion switch
        {
            2 => PackageManifestData.From(root.Deserialize<PackageManifest>(PokemonFieldGuideJson.Options)
                ?? throw new InvalidOperationException($"The package manifest for {definition.Name} could not be loaded.")),
            3 => PackageManifestData.From(root.Deserialize<PackageManifestV3>(PokemonFieldGuideJson.Options)
                ?? throw new InvalidOperationException($"The package manifest for {definition.Name} could not be loaded.")),
            _ => throw new InvalidOperationException(
                $"The {definition.Name} package manifest format v{formatVersion} is not supported.")
        };
    }
}

internal sealed record PackageManifestData(
    IReadOnlyDictionary<string, string> PokemonSprites,
    IReadOnlyDictionary<string, Dictionary<string, string>> PokemonSpritesByVersion,
    IReadOnlyDictionary<string, string> AreaAliases,
    IReadOnlyDictionary<string, Dictionary<string, AreaMapDescriptor>> AreaMapsByVersion)
{
    public static PackageManifestData From(PackageManifest manifest) => new(
        manifest.PokemonSprites,
        manifest.PokemonSpritesByVersion,
        manifest.AreaAliases,
        new Dictionary<string, Dictionary<string, AreaMapDescriptor>>());

    public static PackageManifestData From(PackageManifestV3 manifest) => new(
        manifest.PokemonSprites,
        manifest.PokemonSpritesByVersion,
        manifest.AreaAliases,
        manifest.AreaMapsByVersion);
}
