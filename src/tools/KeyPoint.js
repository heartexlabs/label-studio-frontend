import { types } from "mobx-state-tree";

import BaseTool from "./Base";
import ToolMixin from "../mixins/Tool";
import { NodeViews } from "../components/Node/Node";
import { DrawingTool } from "../mixins/DrawingTool";

const _Tool = types
  .model({
    default: types.optional(types.boolean, true),
  })
  .views(self => ({
    get tagTypes() {
      return {
        stateTypes: "keypointlabels",
        controlTagTypes: ["keypointlabels", "keypoint"],
      };
    },
    get viewTooltip() {
      return "Key point region";
    },
    get iconComponent() {
      return NodeViews.KeyPointRegionModel[1];
    },
  }))
  .actions(self => ({
    clickEv(ev, [x, y]) {
      const c = self.control;
      if (c.type === "keypointlabels" && !c.isSelected) return;

      const keyPoint = self.createRegion({
        x: x,
        y: y,
        width: Number(c.strokewidth),
        coordstype: "px",
      });
      keyPoint.setDrawing(false);
    },
  }));

const KeyPoint = types.compose(ToolMixin, BaseTool, DrawingTool, _Tool);

// Registry.addTool("keypoint", KeyPoint);

export { KeyPoint };
