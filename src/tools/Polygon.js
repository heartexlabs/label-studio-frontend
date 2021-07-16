import { types } from "mobx-state-tree";

import BaseTool, { DEFAULT_DIMENSIONS } from "./Base";
import ToolMixin from "../mixins/Tool";
import { MultipleClicksDrawingTool } from "../mixins/DrawingTool";
import { NodeViews } from "../components/Node/Node";
import { observe } from "mobx";

const _Tool = types
  .model("PolygonTool")
  .views(self => {
    const Super = {
      createRegionOptions: self.createRegionOptions,
      isIncorrectControl: self.isIncorrectControl,
      isIncorrectLabel: self.isIncorrectLabel,
    };
    return {
      get getActivePolygon() {
        const poly = self.currentArea;

        if (poly && poly.closed) return null;
        if (poly === undefined) return null;
        if (poly && poly.type !== "polygonregion") return null;

        return poly;
      },

      get tagTypes() {
        return {
          stateTypes: "polygonlabels",
          controlTagTypes: ["polygonlabels", "polygon"],
        };
      },

      get viewTooltip() {
        return "Polygon region";
      },
      get iconComponent() {
        return NodeViews.PolygonRegionModel[1];
      },

      get defaultDimensions() {
        return DEFAULT_DIMENSIONS.polygon;
      },

      moreRegionParams(obj) {
        return {
          x: obj.value.points[0][0],
          y: obj.value.points[0][1],
        };
      },

      createRegionOptions({ x, y }) {
        return Super.createRegionOptions({
          points: [[x, y]],
          width: 10,
        });
      },

      isIncorrectControl() {
        return Super.isIncorrectControl() && self.current() === null;
      },
      isIncorrectLabel() {
        return !self.current() && Super.isIncorrectLabel();
      },
      canStart() {
        return self.current() === null;
      },

      current() {
        return self.getActivePolygon;
      },
    };
  })
  .actions(self => {
    let disposer;
    let closed;
    return {
      listenForClose() {
        closed = false;
        disposer = observe(self.getCurrentArea(), "closed", ()=>{
          if (self.getCurrentArea().closed && !closed) {
            self.finishDrawing();
          }
        }, true);
      }, 
      closeCurrent() {
        if (disposer) disposer();
        if (closed) return;
        closed = true;
        self.getCurrentArea().closePoly();
      },
    };
  });

const Polygon = types.compose(ToolMixin, BaseTool, MultipleClicksDrawingTool, _Tool);

export { Polygon };

// ImageTools.addTool(PolygonTool);
