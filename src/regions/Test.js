import { types, getParent, getRoot } from "mobx-state-tree";
import { cloneNode } from "../core/Helpers";
import { guidGenerator } from "../core/Helpers";

const Region = types.model({
  name: types.string,
});

export const ImageRegion = types.compose(
  "Image",
  Region,
  types
    .model({
      id: types.identifier,
      type: types.literal("image"),
    })
    .actions(self => ({
      draw() {
        console.log("DRAW", self.id);
      },
    })),
);

export const TextRegion = types.compose(
  "Text",
  Region,
  types
    .model({
      id: types.identifier,
      type: types.literal("text"),
    })
    .actions(self => ({
      select() {
        console.log("SELECT", self.id);
      },
    })),
);

// const HyperTextRegion = types.model({
//   id: types.identifier,
//   type: types.literal(""),
// });

// const AudioRegion = types.model({
//   id: types.identifier,
//   type: types.literal(""),
// });

const TestRaw = types.model("TestRaw", {
  regions: types.array(types.union(ImageRegion, TextRegion)),
  // inheritance: types.array(Region), // wrong :(
  meta: types.number,
});

const TestMeta = types.model({
  meta: types.model({
    width: 120,
    height: 100,
  }),
});

const Test = types.compose("Test", TestRaw, TestMeta);

export default Test;
