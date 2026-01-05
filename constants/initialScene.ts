export const initialScene = {
  "name": "Castle Fortress",
  "materials": [
    { "id": 0, "name": "Grass", "color": [0.122, 0.678, 0.286], "type": 0, "roughness": 0.9 },
    { "id": 1, "name": "Dark Forest", "color": [0.114, 0.243, 0.153], "type": 0, "roughness": 0.9 },
    { "id": 2, "name": "Castle Stone", "color": [0.173, 0.173, 0.208], "type": 0, "roughness": 0.4 },
    { "id": 3, "name": "Ancient Wood", "color": [0.4, 0.25, 0.12], "type": 0, "roughness": 0.1 },
    { "id": 4, "name": "Deep Moat", "color": [0.08, 0.2, 0.25], "type": 1, "roughness": 0.02 },
    { "id": 5, "name": "Dark Metal", "color": [0.067, 0.055, 0.055], "type": 0, "roughness": 0.1 },
    { "id": 6, "name": "Inner Clay", "color": [0.196, 0.122, 0.122], "type": 0, "roughness": 0.3 },
    { "id": 7, "name": "Forest Leaves", "color": [0.012, 0.09, 0.024], "type": 0, "roughness": 0.4 }
  ],
  "logic": [
    {
      "id": "grass-field",
      "name": "Grass Field",
      "type": 0,
      "isEnd": false,
      "isOut": true,
      "geometry": { "type": 0, "pos": [0, 0, 0], "size": [20, 0, 20], "axis": [0, 1, 0], "angle": 0, "matId": 1 }
    },
    {
      "id": "castle-main-aabb",
      "name": "Castle Fortress",
      "type": 6,
      "isEnd": false,
      "isOut": false,
      "geometry": { "type": 0, "pos": [0, 4, 0], "size": [10, 4, 10], "axis": [0, 1, 0], "angle": 0, "matId": 5 },
      "children": [
        {
          "id": "outer-walls",
          "name": "Outer Walls",
          "type": 0,
          "isEnd": false,
          "isOut": false,
          "geometry": { "type": 0, "pos": [0, 1.6, 0], "size": [6.5, 1.6, 6.5], "axis": [0, 1, 0], "angle": 0, "matId": 2 }
        },
        {
          "id": "inner-courtyard",
          "name": "Inner Courtyard",
          "type": 2,
          "isEnd": false,
          "isOut": false,
          "geometry": { "type": 0, "pos": [0, 1.8, 0], "size": [5.6, 1.5, 5.6], "axis": [0, 1, 0], "angle": 0, "matId": 6 }
        },
        {
          "id": "gate-opening",
          "name": "Gate Hole",
          "type": 2,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 0, "pos": [0, 1.4, 6.45], "size": [1.2, 1, 1.4], "axis": [0, 1, 0], "angle": 0, "matId": 2 }
        },
        {
          "id": "keep-donjon",
          "name": "Main Keep",
          "type": 0,
          "isEnd": false,
          "isOut": false,
          "geometry": { "type": 0, "pos": [0, 3.4, 0], "size": [2.2, 3.2, 2.2], "axis": [0, 1, 0], "angle": 0, "matId": 2 }
        },
        {
          "id": "keep-entrance",
          "name": "Keep Door",
          "type": 2,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 0, "pos": [0, 1.2, 2.15], "size": [0.55, 1.2, 0.35], "axis": [0, 1, 0], "angle": 0, "matId": 5 }
        },
        {
          "id": "keep-cap",
          "name": "Keep Battlement",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 0, "pos": [0, 6.4, 0], "size": [2.4, 0.35, 2.4], "axis": [0, 1, 0], "angle": 0, "matId": 5 }
        },
        {
          "id": "gatehouse-block",
          "name": "Gatehouse",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 0, "pos": [0, 3.45, 6.35], "size": [1.8, 0.35, 0.35], "axis": [0, 1, 0], "angle": 0, "matId": 5 }
        },
        {
          "id": "tower-nw",
          "name": "Tower NW",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 2, "pos": [-5.8, 2.4, -5.8], "size": [1.2, 2.4, 1.2], "axis": [1, 0, 0], "angle": 1.57, "matId": 2 }
        },
        {
          "id": "tower-ne",
          "name": "Tower NE",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 2, "pos": [5.8, 2.4, -5.8], "size": [1.2, 2.4, 1.2], "axis": [1, 0, 0], "angle": 1.57, "matId": 2 }
        },
        {
          "id": "tower-se",
          "name": "Tower SE",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 2, "pos": [5.8, 2.4, 5.8], "size": [1.2, 2.4, 1.2], "axis": [1, 0, 0], "angle": 1.57, "matId": 2 }
        },
        {
          "id": "tower-sw",
          "name": "Tower SW",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 2, "pos": [-5.8, 2.4, 5.8], "size": [1.2, 2.4, 1.2], "axis": [1, 0, 0], "angle": 1.57, "matId": 2 }
        },
        {
          "id": "top-nw",
          "name": "Tower Top NW",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 3, "pos": [-5.8, 5.75, -5.8], "size": [1.45, 0.35, 1.45], "axis": [1, 0, 0], "angle": 1.57, "matId": 5 }
        },
        {
          "id": "top-ne",
          "name": "Tower Top NE",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 3, "pos": [5.8, 5.75, -5.8], "size": [1.45, 0.35, 1.45], "axis": [1, 0, 0], "angle": 1.57, "matId": 5 }
        },
        {
          "id": "top-se",
          "name": "Tower Top SE",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 3, "pos": [5.8, 5.75, 5.8], "size": [1.45, 0.35, 1.45], "axis": [1, 0, 0], "angle": 1.57, "matId": 5 }
        },
        {
          "id": "top-sw",
          "name": "Tower Top SW",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 3, "pos": [-5.8, 5.75, 5.8], "size": [1.45, 0.35, 1.45], "axis": [1, 0, 0], "angle": 1.57, "matId": 5 }
        },
        {
          "id": "crenel-1",
          "name": "Front Crenel L",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 0, "pos": [-3.2, 3.45, 6.35], "size": [0.55, 0.35, 0.35], "axis": [0, 1, 0], "angle": 0, "matId": 5 }
        },
        {
          "id": "crenel-3",
          "name": "Front Crenel R",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 0, "pos": [3.2, 3.45, 6.35], "size": [0.55, 0.35, 0.35], "axis": [0, 1, 0], "angle": 0, "matId": 5 }
        },
        {
          "id": "moat-outer",
          "name": "Moat Volume",
          "type": 0,
          "isEnd": false,
          "isOut": false,
          "geometry": { "type": 0, "pos": [0, 0.25, 0], "size": [9.2, 0.25, 9.2], "axis": [0, 1, 0], "angle": 0, "matId": 1 }
        },
        {
          "id": "moat-water",
          "name": "Moat Water",
          "type": 2,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 0, "pos": [0, 0.4, 0], "size": [8.2, 0.2, 8.2], "axis": [0, 1, 0], "angle": 0, "matId": 4 }
        },
        {
          "id": "bridge-draw",
          "name": "Wood Drawbridge",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 0, "pos": [0, 0.45, 7.2], "size": [1.2, 0.1, 1.2], "axis": [1, 0, 0], "angle": 0, "matId": 3 }
        }
      ]
    },
    {
      "id": "trees-right-aabb",
      "name": "East Forest",
      "type": 6,
      "isEnd": false,
      "isOut": false,
      "geometry": { "type": 0, "pos": [15, 2, 0], "size": [5, 3, 8], "axis": [0, 1, 0], "angle": 0, "matId": 5 },
      "children": [
        {
          "id": "tree-r-1",
          "name": "Elm Tree",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 1, "pos": [11, 1.5, 0], "size": [1, 2, 1], "axis": [0, 1, 0], "angle": 0, "matId": 7 }
        },
        {
          "id": "tree-r-2",
          "name": "Oak Tree",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 1, "pos": [13, 1.5, 5], "size": [1, 2, 1], "axis": [0, 1, 0], "angle": 0, "matId": 7 }
        },
        {
          "id": "tree-r-3",
          "name": "Pine Tree",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 1, "pos": [15, 1.5, -5], "size": [1, 2, 1], "axis": [0, 1, 0], "angle": 0, "matId": 7 }
        }
      ]
    },
    {
      "id": "trees-left-aabb",
      "name": "West Forest",
      "type": 6,
      "isEnd": false,
      "isOut": false,
      "geometry": { "type": 0, "pos": [-15, 2, 0], "size": [5, 3, 8], "axis": [0, 1, 0], "angle": 0, "matId": 5 },
      "children": [
        {
          "id": "tree-l-1",
          "name": "Ancient Birch",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 1, "pos": [-11, 1.5, 0], "size": [1, 2, 1], "axis": [0, 1, 0], "angle": 0, "matId": 7 }
        },
        {
          "id": "tree-l-2",
          "name": "Young Oak",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 1, "pos": [-13, 1.5, 5], "size": [1, 2, 1], "axis": [0, 1, 0], "angle": 0, "matId": 7 }
        },
        {
          "id": "tree-l-3",
          "name": "Willow",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 1, "pos": [-15, 1.5, -5], "size": [1, 2, 1], "axis": [0, 1, 0], "angle": 0, "matId": 7 }
        }
      ]
    },
    {
      "id": "trees-behind-aabb",
      "name": "Mountain Forest",
      "type": 6,
      "isEnd": false,
      "isOut": false,
      "geometry": { "type": 0, "pos": [0, 2, -15], "size": [8, 3, 5], "axis": [0, 1, 0], "angle": 0, "matId": 5 },
      "children": [
        {
          "id": "tree-b-1",
          "name": "Great Spruce",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 1, "pos": [0, 1.5, -15], "size": [1, 2, 1], "axis": [0, 1, 0], "angle": 0, "matId": 7 }
        },
        {
          "id": "tree-b-2",
          "name": "Cedar Tree",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 1, "pos": [-7, 1.5, -13], "size": [1, 2, 1], "axis": [0, 1, 0], "angle": 0, "matId": 7 }
        },
        {
          "id": "tree-b-3",
          "name": "Larch Tree",
          "type": 0,
          "isEnd": false,
          "isOut": true,
          "geometry": { "type": 1, "pos": [7, 1.5, -11], "size": [1, 2, 1], "axis": [0, 1, 0], "angle": 0, "matId": 7 }
        }
      ]
    }
  ]
};
