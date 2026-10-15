"""Draws Seizora's in-world info boards as PNG images.

    python worlds/seizora/boards/make_boards.py

The PNGs are committed (so a deploy needs no Python) and
worlds/seizora/models/build-models.mjs mounts each one on a standing board
model. Re-run this after editing a board's text.
"""
import os
import textwrap

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyBboxPatch, Polygon, Rectangle

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 12.0, 7.5  # inches; 1200 x 750 px at 100 dpi

BOARDS = {
    "welcome": {
        "title": "Welcome to Seizora",
        "color": "#e8913a",
        "lines": [
            "A solar, wind, and storage microgrid for a Philippine community, from the lab to the grid.",
            "Garden: the solar farm, a perovskite pilot row, wind turbines, and a battery.",
            "Classroom: inside a perovskite solar cell, layer by layer.",
            "The sky follows real Philippine time and weather; so does the plant's output.",
            "Control room: open /seizora/ on this site, or ask your facilitator to share it on a screen.",
        ],
        "art": "sun",
    },
    "solar": {
        "title": "The solar farm",
        "color": "#3b7bff",
        "lines": [
            "3.6 MW of silicon panels and a 0.6 MW perovskite pilot row (the back row, in brown).",
            "Tilted 15° to the south to face the sun's path at this latitude.",
            "Clear noon: about 1,000 W/m² of sunlight. Full overcast: about a quarter of that.",
            "Panels lose output as they heat up, so a bright cool morning can beat a hot afternoon.",
        ],
        "art": "panels",
    },
    "wind": {
        "title": "Wind turbines",
        "color": "#1d9f80",
        "lines": [
            "Two 1.5 MW turbines, 14 m to the hub.",
            "Power rises with the cube of wind speed: double the wind, eight times the power.",
            "They start at about 3 m/s, reach full power at 12 m/s, and stop above 25 m/s.",
            "In a typhoon they feather their blades and brake, so they produce nothing.",
        ],
        "art": "turbine",
    },
    "battery": {
        "title": "Battery storage",
        "color": "#8a5fe0",
        "lines": [
            "6 MWh of batteries that charge or discharge at up to 3 MW.",
            "They store the midday surplus for the evening peak, when homes light up after sunset.",
            "About a tenth of the energy is lost on the round trip.",
            "Cut off from the main grid, the battery decides how long the lights stay on.",
        ],
        "art": "battery",
    },
    "perovskite": {
        "title": "Inside a perovskite solar cell",
        "color": "#a8492b",
        "lines": [
            "Top to bottom: glass, transparent electrode, electron transport, perovskite, hole transport, back contact.",
            "The perovskite layer is thinner than a thousandth of a millimetre, yet absorbs sunlight strongly.",
            "It can be printed on glass or flexible film: Japan is developing it for walls and roofs.",
            "Its weakness is moisture, heat, and light, which makes the Philippines a hard test.",
        ],
        "art": "layers",
    },
}


def draw_art(ax, kind):
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.set_aspect("equal")
    ax.axis("off")
    if kind == "sun":
        ax.add_patch(Rectangle((0, 0), 10, 10, color="#f7d9b0"))
        ax.add_patch(Circle((5, 5.6), 2.2, color="#ffb347"))
        for i in range(12):
            import math
            a = i * math.pi / 6
            ax.plot([5 + 2.6 * math.cos(a), 5 + 3.6 * math.cos(a)], [5.6 + 2.6 * math.sin(a), 5.6 + 3.6 * math.sin(a)], color="#ff9b2f", lw=5)
        ax.add_patch(Rectangle((0, 0), 10, 1.6, color="#5b7a3a"))
    elif kind == "panels":
        ax.add_patch(Rectangle((0, 0), 10, 10, color="#dceaf7"))
        ax.add_patch(Circle((8.3, 8.3), 1.1, color="#ffd36b"))
        for r, colour in enumerate(["#1d3a7a", "#1d3a7a", "#5a2a18"]):
            y = 1.5 + r * 2.2
            ax.add_patch(Polygon([(0.8 + r * 0.4, y), (8.6 + r * 0.4, y), (8.2 + r * 0.4, y + 1.6), (1.2 + r * 0.4, y + 1.6)], color=colour))
            for c in range(1, 6):
                x = 0.8 + r * 0.4 + c * 1.3
                ax.plot([x, x - 0.07], [y, y + 1.6], color="#9fb6d9", lw=1)
    elif kind == "turbine":
        ax.add_patch(Rectangle((0, 0), 10, 10, color="#e7f3ef"))
        ax.add_patch(Polygon([(4.8, 0.5), (5.2, 0.5), (5.08, 6.5), (4.92, 6.5)], color="#d4dadd"))
        import math
        for k in range(3):
            a = math.radians(90 + k * 120 + 15)
            ax.add_patch(Polygon([(5, 6.5), (5 + 3.4 * math.cos(a) - 0.25 * math.sin(a), 6.5 + 3.4 * math.sin(a) + 0.25 * math.cos(a)), (5 + 3.4 * math.cos(a), 6.5 + 3.4 * math.sin(a))], color="#ffffff", ec="#9aa5aa"))
        ax.add_patch(Circle((5, 6.5), 0.3, color="#9aa5aa"))
    elif kind == "battery":
        ax.add_patch(Rectangle((0, 0), 10, 10, color="#efeaf8"))
        ax.add_patch(FancyBboxPatch((1.2, 2.5), 7, 5, boxstyle="round,pad=0.1,rounding_size=0.4", fc="white", ec="#7d55e8", lw=4))
        ax.add_patch(Rectangle((8.3, 4.2), 0.6, 1.6, color="#7d55e8"))
        ax.add_patch(Rectangle((1.5, 2.8), 4.2, 4.4, color="#b78cff"))
        ax.text(6.6, 5, "60%", fontsize=26, color="#5a3bb0", ha="center", va="center")
    elif kind == "layers":
        ax.add_patch(Rectangle((0, 0), 10, 10, color="#ffffff"))
        layers = [("#bfe8f2", "glass"), ("#8cc9ef", "TCO"), ("#ececf2", "electron transport"), ("#7a3a24", "perovskite"), ("#a98ad0", "hole transport"), ("#e3b85a", "back contact")]
        for i, (c, t) in enumerate(layers):
            y = 8.4 - i * 1.45
            ax.add_patch(Rectangle((0.6, y), 8.8, 1.1, color=c, ec="#888"))
            ax.text(5, y + 0.55, t, ha="center", va="center", fontsize=15, color="white" if c == "#7a3a24" else "#222")


def make(name, board):
    fig = plt.figure(figsize=(W, H), dpi=100)
    fig.patch.set_facecolor("#fbf8f2")
    fig.add_artist(Rectangle((0, 0.84), 1, 0.16, transform=fig.transFigure, color=board["color"]))
    fig.text(0.04, 0.915, board["title"], fontsize=40, fontweight="bold", color="white", va="center")
    fig.text(0.96, 0.915, "SEIZORA", fontsize=16, color="white", va="center", ha="right", alpha=0.85)
    art = fig.add_axes([0.04, 0.08, 0.36, 0.7])
    draw_art(art, board["art"])
    y = 0.74
    for line in board["lines"]:
        wrapped = textwrap.fill(line, 46)
        fig.text(0.44, y, "•", fontsize=19, color=board["color"], va="top")
        fig.text(0.47, y, wrapped, fontsize=18, color="#1f2430", va="top", linespacing=1.2)
        y -= 0.0425 * (wrapped.count("\n") + 1) + 0.035
    fig.text(0.44, 0.05, "A learning model: the plant is invented and the weather is synthetic.", fontsize=13, color="#6b7280")
    out = os.path.join(HERE, f"{name}.png")
    fig.savefig(out, facecolor=fig.get_facecolor())
    plt.close(fig)
    print("wrote", out)


if __name__ == "__main__":
    for name, board in BOARDS.items():
        make(name, board)
