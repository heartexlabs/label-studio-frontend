import { types, getRoot } from "mobx-state-tree";

import * as Tools from "../../tools";
import Registry from "../../core/Registry";

/**
 * Ellipse
 * Ellipse is used to add ellipse (elleptic Bounding Box) to an image
 * @example
 * <View>
 *   <Ellipse name="ellipse1-1" toName="img-1"></Ellipse>
 *   <Image name="img-1" value="$img"></Image>
 * </View>
 * @name Ellipse
 * @param {string} name name of the element
 * @param {string} toname name of the image to label
 * @param {float=} [opacity=0.6] opacity of ellipse
 * @param {string=} fillColor rectangle fill color, default is transparent
 * @param {string=} [strokeColor=#f48a42] stroke color
 * @param {number=} [strokeWidth=1] width of the stroke
 * @param {boolean=} [canRotate=true] show or hide rotation handle
 */
const TagAttrs = types.model({
  name: types.maybeNull(types.string),
  toname: types.maybeNull(types.string),

  opacity: types.optional(types.string, "0.6"),
  fillcolor: types.maybeNull(types.string),

  strokeWidth: types.optional(types.number, 1),
  strokeColor: types.optional(types.string, "#f48a42"),

  canrotate: types.optional(types.boolean, true),
});

const Model = types
  .model({
    id: types.identifier,
    type: "ellipse",
  })
  .views(self => ({
    get hasStates() {
      const states = self.states();
      return states && states.length > 0;
    },

    get completion() {
      return getRoot(self).completionStore.selected;
    },
  }))
  .actions(self => ({
    getTools() {
      return Object.values(self.tools);
    },

    afterCreate() {
      const ellipse = Tools.Ellipse.create({ activeShape: null });
      ellipse._control = self;

      self.tools = { ellipse: ellipse };
    },
  }));

const EllipseModel = types.compose("EllipseModel", TagAttrs, Model);

const HtxView = () => {
  return null;
};

Registry.addTag("ellipse", EllipseModel, HtxView);

export { HtxView, EllipseModel };
