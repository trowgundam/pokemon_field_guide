using PokemonFieldGuide.Services;

using Xunit;

namespace PokemonFieldGuide.Tests;

public sealed class WorldAreaBoundaryTests
{
    [Fact]
    public void ExteriorEdges_remove_the_shared_edge_between_adjacent_regions()
    {
        var regions = new[]
        {
            Rectangle(0, 0, 10, 10),
            Rectangle(10, 0, 20, 10)
        };

        var edges = WorldAreaBoundary.ExteriorEdges(regions);

        Assert.Equal(6, edges.Count);
        Assert.DoesNotContain(edges, edge =>
            edge.Start == new CanvasPoint(10, 0) && edge.End == new CanvasPoint(10, 10)
            || edge.Start == new CanvasPoint(10, 10) && edge.End == new CanvasPoint(10, 0));
    }

    [Fact]
    public void ExteriorEdges_keep_every_edge_of_disconnected_regions()
    {
        var regions = new[]
        {
            Rectangle(0, 0, 10, 10),
            Rectangle(20, 0, 30, 10)
        };

        var edges = WorldAreaBoundary.ExteriorEdges(regions);

        Assert.Equal(8, edges.Count);
    }

    private static WorldPolygon Rectangle(double left, double top, double right, double bottom) => new([
        new(left, top),
        new(right, top),
        new(right, bottom),
        new(left, bottom)
    ]);
}
