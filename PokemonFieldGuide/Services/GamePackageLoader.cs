using System.Net.Http.Json;

namespace PokemonFieldGuide.Services;

internal sealed class GamePackageLoader(HttpClient http)
{
    public async Task<GameCatalog> LoadCatalogAsync() =>
        await http.GetFromJsonAsync<GameCatalog>("games/catalog.json", PokemonFieldGuideJson.Options)
        ?? throw new InvalidOperationException("The game catalog could not be loaded.");

    public async Task<GamePackage> LoadAsync(GameDefinition definition)
    {
        var fieldGuideTask = http.GetFromJsonAsync<FieldGuideData>(definition.DataPath, PokemonFieldGuideJson.Options);
        var pokedexTask = http.GetFromJsonAsync<List<PokedexEntry>>(definition.PokedexPath, PokemonFieldGuideJson.Options);
        var worldsTask = http.GetFromJsonAsync<List<GuideWorld>>(definition.WorldsPath, PokemonFieldGuideJson.Options);
        var manifestPath = $"{definition.DataPath[..(definition.DataPath.LastIndexOf('/') + 1)]}package-manifest.json";
        var manifestTask = http.GetFromJsonAsync<PackageManifest>(manifestPath, PokemonFieldGuideJson.Options);
        await Task.WhenAll(fieldGuideTask, pokedexTask, worldsTask, manifestTask);

        return new GamePackage(
            definition,
            await fieldGuideTask ?? throw new InvalidOperationException($"Field-guide data for {definition.Name} could not be loaded."),
            await pokedexTask ?? [],
            await worldsTask ?? [],
            await manifestTask ?? throw new InvalidOperationException($"The package manifest for {definition.Name} could not be loaded."));
    }
}