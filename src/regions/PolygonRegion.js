import Konva from "konva";
import React from "react";
import { Group, Line } from "react-konva";
import { types, destroy, detach, getRoot } from "mobx-state-tree";

import Constants from "../core/Constants";
import NormalizationMixin from "../mixins/Normalization";
import RegionsMixin from "../mixins/Regions";
import Registry from "../core/Registry";
import WithStatesMixin from "../mixins/WithStates";
import { ImageModel } from "../tags/object/Image";
import { LabelOnPolygon } from "../components/ImageView/LabelOnRegion";
import { PolygonPoint, PolygonPointView } from "./PolygonPoint";
import { green } from "@ant-design/colors";
import { guidGenerator } from "../core/Helpers";
import { AreaMixin } from "../mixins/AreaMixin";
import { useRegionColors } from "../hooks/useRegionColor";
import { AliveRegion } from "./AliveRegion";
import { KonvaRegionMixin } from "../mixins/KonvaRegion";

const Model = types
  .model({
    id: types.optional(types.identifier, guidGenerator),
    pid: types.optional(types.string, guidGenerator),
    type: "polygonregion",
    object: types.late(() => types.reference(ImageModel)),

    points: types.array(types.union(PolygonPoint, types.array(types.number)), []),

    coordstype: types.optional(types.enumeration(["px", "perc"]), "perc"),
  })
  .volatile(self => ({
    closed: false,
    mouseOverStartPoint: false,
    selectedPoint: null,
    hideable: true,
  }))
  .views(self => ({
    get store() {
      return getRoot(self);
    },
  }))
  .actions(self => ({
    afterCreate() {
      if (!self.points.length) return;
      if (!self.points[0].id) {
        self.points = self.points.map(([x, y], index) => ({
          id: guidGenerator(),
          x: x,
          y: y,
          size: self.pointSize,
          style: self.pointStyle,
          index,
        }));
      }

      if (self.points.length > 2) self.closed = true;
    },

    /**
     * @todo excess method; better to handle click only on start point
     * Handler for mouse on start point of Polygon
     * @param {boolean} val
     */
    setMouseOverStartPoint(value) {
      self.mouseOverStartPoint = value;
    },

    // @todo not used
    setSelectedPoint(point) {
      if (self.selectedPoint) {
        self.selectedPoint.selected = false;
      }

      point.selected = true;
      self.selectedPoint = point;
    },

    handleMouseMove({ e, flattenedPoints }) {
      const { offsetX, offsetY } = e.evt;
      const [cursorX, cursorY] = self.parent.fixZoomedCoords([offsetX, offsetY]);
      const [x, y] = getAnchorPoint({ flattenedPoints, cursorX, cursorY });

      const group = e.currentTarget;
      const layer = e.currentTarget.getLayer();
      const zoom = self.parent.zoomScale;

      moveHoverAnchor({ point: [x, y], group, layer, zoom });
    },

    handleMouseLeave({ e }) {
      removeHoverAnchor({ layer: e.currentTarget.getLayer() });
    },

    handleLineClick({ e, flattenedPoints, insertIdx }) {
      if (!self.closed || !self.selected) return;

      e.cancelBubble = true;

      removeHoverAnchor({ layer: e.currentTarget.getLayer() });

      const { offsetX, offsetY } = e.evt;
      const [cursorX, cursorY] = self.parent.fixZoomedCoords([offsetX, offsetY]);
      const point = getAnchorPoint({ flattenedPoints, cursorX, cursorY });

      self.insertPoint(insertIdx, point[0], point[1]);
    },

    deletePoint(point) {
      if (!self.points.includes(point)) return;
      if (self.points.length <= 3) return;
      if (self.selectedPoint === point) {
        self.selectedPoint = null;
      }
      destroy(point);
    },

    addPoint(x, y) {
      if (self.closed) return;
      self._addPoint(x, y);
    },

    insertPoint(insertIdx, x, y) {
      const p = {
        id: guidGenerator(),
        x: x,
        y: y,
        size: self.pointSize,
        style: self.pointStyle,
        index: self.points.length,
      };
      self.points.splice(insertIdx, 0, p);
    },

    _addPoint(x, y) {
      self.points.push({
        id: guidGenerator(),
        x: x,
        y: y,
        size: self.pointSize,
        style: self.pointStyle,
        index: self.points.length,
      });
    },

    // @todo not used
    // only px coordtype here
    rotate(degree = -90) {
      self.points.forEach(point => {
        const p = self.rotatePoint(point, degree);
        point._movePoint(p.x, p.y);
      });
    },

    closePoly() {
      self.closed = true;
    },

    canClose(x, y) {
      if (self.points.length < 2) return false;

      const p1 = self.points[0];
      const p2 = { x, y };

      var r = 50;
      var dist_points = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;

      if (dist_points < r) {
        return true;
      } else {
        return false;
      }
    },

    destroyRegion() {
      detach(self.points);
      destroy(self.points);
    },

    afterUnselectRegion() {
      if (self.selectedPoint) {
        self.selectedPoint.selected = false;
      }

      // self.points.forEach(p => p.computeOffset());
    },

    setScale(x, y) {
      self.scaleX = x;
      self.scaleY = y;
    },

    updateOffset() {
      self.points.map(p => p.computeOffset());
    },

    updateImageSize(wp, hp, sw, sh) {
      if (self.coordstype === "px") {
        self.points.forEach(p => {
          const x = (sw * p.relativeX) / 100;
          const y = (sh * p.relativeY) / 100;

          p._movePoint(x, y);
        });
      }

      if (!self.annotation.sentUserGenerate && self.coordstype === "perc") {
        self.points.forEach(p => {
          const x = (sw * p.x) / 100;
          const y = (sh * p.y) / 100;
          self.coordstype = "px";
          p._movePoint(x, y);
        });
      }
    },

    serialize() {
      if (self.points.length < 3) return null;
      return {
        original_width: self.parent.naturalWidth,
        original_height: self.parent.naturalHeight,
        image_rotation: self.parent.rotation,
        value: {
          points: self.points.map(p => [self.convertXToPerc(p.x), self.convertYToPerc(p.y)]),
        },
      };
    },
  }));

const PolygonRegionModel = types.compose(
  "PolygonRegionModel",
  WithStatesMixin,
  RegionsMixin,
  AreaMixin,
  NormalizationMixin,
  KonvaRegionMixin,
  Model,
);

/**
 * Get coordinates of anchor point
 * @param {array} flattenedPoints
 * @param {number} cursorX coordinates of cursor X
 * @param {number} cursorY coordinates of cursor Y
 */
function getAnchorPoint({ flattenedPoints, cursorX, cursorY }) {
  const [point1X, point1Y, point2X, point2Y] = flattenedPoints;
  const y =
    ((point2X - point1X) * (point2X * point1Y - point1X * point2Y) +
      (point2X - point1X) * (point2Y - point1Y) * cursorX +
      (point2Y - point1Y) * (point2Y - point1Y) * cursorY) /
    ((point2Y - point1Y) * (point2Y - point1Y) + (point2X - point1X) * (point2X - point1X));
  const x =
    cursorX -
    ((point2Y - point1Y) *
      (point2X * point1Y - point1X * point2Y + cursorX * (point2Y - point1Y) - cursorY * (point2X - point1X))) /
      ((point2Y - point1Y) * (point2Y - point1Y) + (point2X - point1X) * (point2X - point1X));

  return [x, y];
}

function getFlattenedPoints(points) {
  const p = points.map(p => [p.x, p.y]);
  return p.reduce(function(flattenedPoints, point) {
    return flattenedPoints.concat(point);
  }, []);
}

function getHoverAnchor({ layer }) {
  return layer.findOne(".hoverAnchor");
}

/**
 * Create new anchor for current polygon
 */
function createHoverAnchor({ point, group, layer, zoom }) {
  const hoverAnchor = new Konva.Circle({
    name: "hoverAnchor",
    x: point[0],
    y: point[1],
    stroke: green.primary,
    fill: green[0],
    scaleX: 1 / (zoom || 1),
    scaleY: 1 / (zoom || 1),

    strokeWidth: 2,
    radius: 5,
  });

  group.add(hoverAnchor);
  layer.draw();
  return hoverAnchor;
}

function moveHoverAnchor({ point, group, layer, zoom }) {
  const hoverAnchor = getHoverAnchor({ layer }) || createHoverAnchor({ point, group, layer, zoom });
  hoverAnchor.to({ x: point[0], y: point[1], duration: 0 });
}

function removeHoverAnchor({ layer }) {
  const hoverAnchor = getHoverAnchor({ layer });
  if (!hoverAnchor) return;
  hoverAnchor.destroy();
  layer.draw();
}

const HtxPolygonView = ({ item }) => {
  const { store } = item;

  const colors = useRegionColors(item, {
    useStrokeAsFill: true,
  });

  /**
   * Render line between 2 points
   */
  function renderLine({ points, idx1, idx2, closed }) {
    const name = `border_${idx1}_${idx2}`;

    if (!item.closed && idx2 === 0) return null;

    const insertIdx = idx1 + 1; // idx1 + 1 or idx2
    const flattenedPoints = getFlattenedPoints([points[idx1], points[idx2]]);

    const lineProps = closed ? {
      stroke: 'transparent',
      strokeWidth: colors.strokeWidth,
      strokeScaleEnabled: false,
    } : {
      stroke: colors.strokeColor,
      strokeWidth: colors.strokeWidth,
      strokeScaleEnabled: false,
    };

    return (
      <Group
        key={name}
        name={name}
        onClick={e => item.handleLineClick({ e, flattenedPoints, insertIdx })}
        onMouseMove={e => {
          if (!item.closed || !item.selected || !item.editable) return;

          item.handleMouseMove({ e, flattenedPoints });
        }}
        onMouseLeave={e => item.handleMouseLeave({ e })}
      >
        <Line
          lineJoin="round"
          opacity={1}
          points={flattenedPoints}
          hitStrokeWidth={20}
          {...lineProps}
        />
      </Group>
    );
  }

  function renderLines(points, closed) {
    const name = "borders";
    return (
      <Group key={name} name={name}>
        {points.map((p, idx) => {
          const idx1 = idx;
          const idx2 = idx === points.length - 1 ? 0 : idx + 1;
          return renderLine({ points, idx1, idx2, closed });
        })}
      </Group>
    );
  }

  function renderPoly(points) {
    const name = "poly";
    const flattenedPoints = getFlattenedPoints(points);
    return (
      <Group key={name} name={name}>
        <Line
          lineJoin="round"
          lineCap="square"
          stroke={colors.strokeColor}
          strokeWidth={colors.strokeWidth}
          strokeScaleEnabled={false}
          points={flattenedPoints}
          fill={colors.fillColor}
          closed={true}
        />
      </Group>
    );
  }

  function renderCircle({ points, idx }) {
    const name = `anchor_${points.length}_${idx}`;
    const point = points[idx];

    if (!item.closed || (item.closed && item.selected)) {
      return <PolygonPointView item={point} name={name} key={name} />;
    }
  }

  function renderCircles(points) {
    const name = "anchors";
    return (
      <Group key={name} name={name}>
        {points.map((p, idx) => renderCircle({ points, idx }))}
      </Group>
    );
  }

  function minMax(items) {
    return items.reduce((acc, val) => {
      acc[0] = acc[0] === undefined || val < acc[0] ? val : acc[0];
      acc[1] = acc[1] === undefined || val > acc[1] ? val : acc[1];
      return acc;
    }, []);
  }

  let minX = 0,
    maxX = 0,
    minY = 0,
    maxY = 0;

  const stage = item.parent.stageRef;

  return (
    <Group
      key={item.id ? item.id : guidGenerator(5)}
      onDragStart={e => {
        if (item.parent.getSkipInteractions()) {
          e.currentTarget.stopDrag(e.evt);
          return;
        }
        item.annotation.setDragMode(true);

        var arrX = item.points.map(p => p.x);
        var arrY = item.points.map(p => p.y);

        [minX, maxX] = minMax(arrX);
        [minY, maxY] = minMax(arrY);
      }}
      dragBoundFunc={item.parent.fixForZoom(pos => {
        let { x, y } = pos;

        const sw = item.parent.stageWidth;
        const sh = item.parent.stageHeight;

        if (minY + y < 0) y = -1 * minY;
        if (minX + x < 0) x = -1 * minX;
        if (maxY + y > sh) y = sh - maxY;
        if (maxX + x > sw) x = sw - maxX;

        return { x: x, y: y };
      })}
      onDragEnd={e => {
        const t = e.target;

        item.annotation.setDragMode(false);
        if (!item.closed) item.closePoly();

        item.annotation.history.freeze();
        item.points.forEach(p => p.movePoint(t.getAttr("x"), t.getAttr("y")));
        item.annotation.history.unfreeze();

        t.setAttr("x", 0);
        t.setAttr("y", 0);
      }}
      onMouseOver={e => {
        if (store.annotationStore.selected.relationMode) {
          item.setHighlight(true);
          stage.container().style.cursor = Constants.RELATION_MODE_CURSOR;
        } else {
          stage.container().style.cursor = Constants.POINTER_CURSOR;
        }
      }}
      onMouseOut={e => {
        stage.container().style.cursor = Constants.DEFAULT_CURSOR;

        if (store.annotationStore.selected.relationMode) {
          item.setHighlight(false);
        }
      }}
      onClick={e => {
        // create regions over another regions with Cmd/Ctrl pressed
        if (e.evt.metaKey || e.evt.ctrlKey || item.parent.getSkipInteractions()) return;
        if (item.isDrawing) return;

        e.cancelBubble = true;

        // if (!item.editable) return;

        if (!item.closed) return;

        if (store.annotationStore.selected.relationMode) {
          stage.container().style.cursor = Constants.DEFAULT_CURSOR;
        }

        item.setHighlight(false);
        item.onClickRegion(e);
      }}
      draggable={item.editable}
    >
      <LabelOnPolygon item={item} color={colors.strokeColor} />

      {item.mouseOverStartPoint}

      {item.points && item.closed ? renderPoly(item.points) : null}
      {item.points ? renderLines(item.points, item.closed) : null}
      {item.points ? renderCircles(item.points) : null}
    </Group>
  );
};

const HtxPolygon = AliveRegion(HtxPolygonView);

Registry.addTag("polygonregion", PolygonRegionModel, HtxPolygon);
Registry.addRegionType(PolygonRegionModel, "image", value => !!value.points);

export { PolygonRegionModel, HtxPolygon };
