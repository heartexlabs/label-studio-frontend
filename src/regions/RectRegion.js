import React, { Fragment } from "react";
import { Rect } from "react-konva";
import { types, getRoot } from "mobx-state-tree";

import Constants  from "../core/Constants";
import DisabledMixin from "../mixins/Normalization";
import NormalizationMixin from "../mixins/Normalization";
import RegionsMixin from "../mixins/Regions";
import Registry from "../core/Registry";
import WithStatesMixin from "../mixins/WithStates";
import { ImageModel } from "../tags/object/Image";
import { LabelOnRect } from "../components/ImageView/LabelOnRegion";
import { guidGenerator } from "../core/Helpers";
import { AreaMixin } from "../mixins/AreaMixin";
import { getBoundingBoxAfterChanges, fixRectToFit } from "../utils/image";
import { useRegionColors } from "../hooks/useRegionColor";
import { AliveRegion } from "./AliveRegion";
import { KonvaRegionMixin } from "../mixins/KonvaRegion";

/**
 * Rectangle object for Bounding Box
 *
 */
const Model = types
  .model({
    id: types.optional(types.identifier, guidGenerator),
    pid: types.optional(types.string, guidGenerator),
    type: "rectangleregion",
    object: types.late(() => types.reference(ImageModel)),

    x: types.number,
    y: types.number,

    width: types.number,
    height: types.number,

    rotation: 0,

    coordstype: types.optional(types.enumeration(["px", "perc"]), "perc"),
  })
  .volatile(self => ({
    relativeX: 0,
    relativeY: 0,

    relativeWidth: 0,
    relativeHeight: 0,

    startX: 0,
    startY: 0,

    // @todo not used
    scaleX: 1,
    scaleY: 1,

    opacity: 1,

    fill: true,
    fillColor: "#ff8800", // Constants.FILL_COLOR,
    fillOpacity: 0.2,

    strokeColor: Constants.STROKE_COLOR,
    strokeWidth: Constants.STROKE_WIDTH,

    supportsTransform: true,
    // depends on region and object tag; they both should correctly handle the `hidden` flag
    hideable: true,
  }))
  .views(self => ({
    get store() {
      return getRoot(self);
    },
    get parent() {
      return self.object;
    },
  }))
  .actions(self => ({
    afterCreate() {
      self.startX = self.x;
      self.startY = self.y;

      switch (self.coordstype)  {
        case "perc": {
          self.relativeX = self.x;
          self.relativeY = self.y;
          self.relativeWidth = self.width;
          self.relativeHeight = self.height;

          const { naturalWidth, naturalHeight, stageWidth: width, stageHeight: height } = self.parent;
          if (width && height) {
            self.updateImageSize(width / naturalWidth, height / naturalHeight, width, height);
          }
          break;
        }
        case "px": {
          const { stageWidth, stageHeight } = self.parent;
          if (stageWidth && stageHeight) {
            self.setPosition(self.x, self.y, self.width, self.height, self.rotation);
          }
          break;
        }
      }

      self.updateAppearenceFromState();
    },

    // @todo not used
    rotate(degree) {
      const p = self.rotatePoint(self, degree);
      if (degree === -90) p.y -= self.width;
      if (degree === 90) p.x -= self.height;
      self.setPosition(p.x, p.y, self.height, self.width, self.rotation);
    },

    // @todo not used
    coordsInside(x, y) {
      // check if x and y are inside the rectangle
      const rx = self.x;
      const ry = self.y;
      const rw = self.width * (self.scaleX || 1);
      const rh = self.height * (self.scaleY || 1);

      if (x > rx && x < rx + rw && y > ry && y < ry + rh) return true;

      return false;
    },

    /**
     * Boundg Box set position on canvas
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @param {number} rotation
     */
    setPosition(x, y, width, height, rotation) {
      self.x = x;
      self.y = y;
      self.width = width;
      self.height = height;

      self.relativeX = (x / self.parent?.stageWidth) * 100;
      self.relativeY = (y / self.parent?.stageHeight) * 100;

      self.relativeWidth = (width / self.parent?.stageWidth) * 100;
      self.relativeHeight = (height / self.parent?.stageHeight) * 100;

      self.rotation = (rotation + 360) % 360;
    },

    setScale(x, y) {
      self.scaleX = x;
      self.scaleY = y;
    },

    addState(state) {
      self.states.push(state);
    },

    setFill(color) {
      self.fill = color;
    },

    updateImageSize(wp, hp, sw, sh) {
      if (self.coordstype === "px") {
        self.x = (sw * self.relativeX) / 100;
        self.y = (sh * self.relativeY) / 100;
        self.width = (sw * self.relativeWidth) / 100;
        self.height = (sh * self.relativeHeight) / 100;
      } else if (self.coordstype === "perc") {
        self.x = (sw * self.x) / 100;
        self.y = (sh * self.y) / 100;
        self.width = (sw * self.width) / 100;
        self.height = (sh * self.height) / 100;
        self.coordstype = "px";
      }
    },

    serialize() {
      return {
        original_width: self.parent.naturalWidth,
        original_height: self.parent.naturalHeight,
        image_rotation: self.parent.rotation,
        value: {
          x: self.convertXToPerc(self.x),
          y: self.convertYToPerc(self.y),
          width: self.convertHDimensionToPerc(self.width),
          height: self.convertVDimensionToPerc(self.height),
          rotation: self.rotation,
        },
      };
    },
  }));

const RectRegionModel = types.compose(
  "RectRegionModel",
  WithStatesMixin,
  RegionsMixin,
  NormalizationMixin,
  DisabledMixin,
  AreaMixin,
  KonvaRegionMixin,
  Model,
);

const HtxRectangleView = ({ item }) => {
  const { store } = item;

  const colors = useRegionColors(item);
  const stage = item.parent.stageRef;

  return (
    <Fragment>
      <Rect
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        fill={colors.fillColor}
        stroke={colors.strokeColor}
        strokeWidth={colors.strokeWidth}
        strokeScaleEnabled={false}
        shadowBlur={0}
        scaleX={item.scaleX}
        scaleY={item.scaleY}
        opacity={1}
        rotation={item.rotation}
        draggable={item.editable}
        name={item.id}
        onTransformEnd={e => {
          const t = e.target;

          item.setPosition(
            t.getAttr("x"),
            t.getAttr("y"),
            t.getAttr("width") * t.getAttr("scaleX"),
            t.getAttr("height") * t.getAttr("scaleY"),
            t.getAttr("rotation"),
          );

          t.setAttr("scaleX", 1);
          t.setAttr("scaleY", 1);
        }}
        onDragStart={e => {
          if (item.parent.getSkipInteractions()) {
            e.currentTarget.stopDrag(e.evt);
            return;
          }
        }}
        onDragEnd={e => {
          const t = e.target;

          item.setPosition(
            t.getAttr("x"),
            t.getAttr("y"),
            t.getAttr("width"),
            t.getAttr("height"),
            t.getAttr("rotation"),
          );
          item.setScale(t.getAttr("scaleX"), t.getAttr("scaleY"));
        }}
        dragBoundFunc={item.parent.fixForZoom(pos => {
          let { x, y } = pos;
          const { width, height, rotation } = item;
          const { stageHeight, stageWidth } = item.parent;
          const selfRect = { x: 0, y: 0, width, height };
          const box = getBoundingBoxAfterChanges(selfRect, { x, y }, rotation);
          const fixed = fixRectToFit(box, stageWidth, stageHeight);

          if (fixed.width !== box.width) {
            x += (fixed.width - box.width) * (fixed.x !== box.x ? -1 : 1);
          }

          if (fixed.height !== box.height) {
            y += (fixed.height - box.height) * (fixed.y !== box.y ? -1 : 1);
          }

          return { x, y };
        })}
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
          if (!item.annotation.editable || item.parent.getSkipInteractions()) return;
          if (store.annotationStore.selected.relationMode) {
            stage.container().style.cursor = Constants.DEFAULT_CURSOR;
          }

          item.setHighlight(false);
          item.onClickRegion(e);
        }}
      />
      <LabelOnRect item={item} color={colors.strokeColor} strokewidth={colors.strokeWidth} />
    </Fragment>
  );
};

const HtxRectangle = AliveRegion(HtxRectangleView);

Registry.addTag("rectangleregion", RectRegionModel, HtxRectangle);
Registry.addRegionType(RectRegionModel, "image");

export { RectRegionModel, HtxRectangle };
