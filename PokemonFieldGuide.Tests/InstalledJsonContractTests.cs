using System.Text.Json;

using PokemonFieldGuide.Services;

using Xunit;

namespace PokemonFieldGuide.Tests;

public sealed class InstalledJsonContractTests
{
    [Fact]
    public void Every_installed_game_package_deserializes_with_the_runtime_contracts()
    {
        var root = RepositoryRoot();
        var webRoot = Path.Combine(root, "PokemonFieldGuide", "wwwroot");
        var catalog = Deserialize<GameCatalog>(Path.Combine(webRoot, "games", "catalog.json"));

        foreach (var game in catalog.Games)
        {
            Deserialize<FieldGuideData>(Path.Combine(webRoot, game.DataPath));
            Deserialize<List<PokedexEntry>>(Path.Combine(webRoot, game.PokedexPath));
            Deserialize<List<GuideWorld>>(Path.Combine(webRoot, game.WorldsPath));
            var manifest = Deserialize<PackageManifest>(Path.Combine(
                Path.GetDirectoryName(Path.Combine(webRoot, game.DataPath))!,
                "package-manifest.json"));
            Assert.Equal(2, manifest.FormatVersion);
        }
    }

    [Fact]
    public void Frlg_owns_a_stable_unown_sprite()
    {
        var root = RepositoryRoot();
        var packageRoot = Path.Combine(root, "PokemonFieldGuide", "wwwroot", "games", "frlg");
        var manifest = Deserialize<PackageManifest>(Path.Combine(packageRoot, "data", "package-manifest.json"));

        Assert.Equal("unown.png", manifest.PokemonSprites["SPECIES_UNOWN"]);
        Assert.True(File.Exists(Path.Combine(packageRoot, "sprites", "pokemon", "unown.png")));
    }

    [Fact]
    public void Crystal_collapses_real_equivalent_time_tables_for_display()
    {
        var webRoot = Path.Combine(RepositoryRoot(), "PokemonFieldGuide", "wwwroot");
        var catalog = Deserialize<GameCatalog>(Path.Combine(webRoot, "games", "catalog.json"));
        var game = Assert.Single(catalog.Games, game => game.Id == "crystal");
        var dataDirectory = Path.GetDirectoryName(Path.Combine(webRoot, game.DataPath))!;
        var package = new GamePackage(
            game,
            Deserialize<FieldGuideData>(Path.Combine(webRoot, game.DataPath)),
            Deserialize<List<PokedexEntry>>(Path.Combine(webRoot, game.PokedexPath)),
            Deserialize<List<GuideWorld>>(Path.Combine(webRoot, game.WorldsPath)),
            Deserialize<PackageManifest>(Path.Combine(dataDirectory, "package-manifest.json")));

        var burnedTowerGroups = package.EncounterGroups(package.Area("MAP_BURNED_TOWER_1F")!, "Crystal");
        Assert.Equal("Random encounters", Assert.Single(burnedTowerGroups, group => group.Name.StartsWith("Random encounters", StringComparison.Ordinal)).Name);

        var route44Names = package.EncounterGroups(package.Area("MAP_ROUTE_44")!, "Crystal").Select(group => group.Name);
        Assert.Contains("Random encounters · Morning / Day", route44Names);
        Assert.Contains("Random encounters · Night", route44Names);
        Assert.Contains("Fishing · Good Rod", route44Names);
    }

    private static T Deserialize<T>(string path) =>
        JsonSerializer.Deserialize<T>(File.ReadAllText(path), PokemonFieldGuideJson.Options)
        ?? throw new InvalidOperationException($"{path} deserialized to null.");

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "global.json"))) return directory.FullName;
        }
        throw new InvalidOperationException("Could not find the repository root containing global.json.");
    }
}
