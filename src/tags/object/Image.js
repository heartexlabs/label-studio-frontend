import { types, getType, getRoot } from "mobx-state-tree";
import { inject } from "mobx-react";

import * as Tools from "../../tools";
import ImageView from "../../components/ImageView/ImageView";
import ObjectBase from "./Base";
import ProcessAttrsMixin from "../../mixins/ProcessAttrs";
import Registry from "../../core/Registry";
import ToolsManager from "../../tools/Manager";
import { BrushRegionModel } from "../../regions/BrushRegion";
import { KeyPointRegionModel } from "../../regions/KeyPointRegion";
import { PolygonRegionModel } from "../../regions/PolygonRegion";
import { RectRegionModel } from "../../regions/RectRegion";
import { EllipseRegionModel } from "../../regions/EllipseRegion";
import { customTypes } from "../../core/CustomTypes";
import { parseValue } from "../../utils/data";
import { AnnotationMixin } from "../../mixins/AnnotationMixin";
import { clamp } from "../../utils/utilities";

/**
 * Image tag shows an image on the page.
 * All the region numbers are percents of image original sizes — [0, 100]
 * @example
 * <View>
 *   <!-- Take the image url from the url column in JSON/CSV -->
 *   <Image value="$url"></Image>
 * </View>
 * @example
 * <View>
 *   <Image value="https://imgflip.com/s/meme/Leonardo-Dicaprio-Cheers.jpg" width="100%" maxWidth="750px" />
 * </View>
 * @name Image
 * @param {string} name                       - Name of the element
 * @param {string} value                      - Value
 * @param {string=} [width=100%]              - Image width
 * @param {string=} [maxWidth=750px]          - Maximum image width
 * @param {boolean=} [zoom=false]             - Enable zooming an image with the mouse wheel
 * @param {boolean=} [negativeZoom=false]     - Enable zooming out an image
 * @param {float=} [zoomBy=1.1]               - Scale factor
 * @param {boolean=} [grid=false]             - Show grid
 * @param {number=} [gridSize=30]             - Specify size of the grid
 * @param {string=} [gridColor="#EEEEF4"]     - Color of the grid, opacity is 0.15
 * @param {boolean} [zoomControl=false]       - Show zoom controls in toolbar
 * @param {boolean} [brightnessControl=false] - Show brightness control in toolbar
 * @param {boolean} [contrastControl=false]   - Show contrast control in toolbar
 * @param {boolean} [rotateControl=false]     - Show rotate control in toolbar
 * @param {boolean} [crosshair=false]         – Show crosshair cursor
 */
const TagAttrs = types.model({
  name: types.identifier,
  value: types.maybeNull(types.string),
  resize: types.maybeNull(types.number),
  width: types.optional(types.string, "100%"),
  maxwidth: types.optional(types.string, "100%"),
  maxheight: types.optional(types.string, "100vh"),

  // rulers: types.optional(types.boolean, true),
  grid: types.optional(types.boolean, false),
  gridSize: types.optional(types.number, 30),
  gridColor: types.optional(customTypes.color, "#EEEEF4"),

  zoom: types.optional(types.boolean, false),
  negativezoom: types.optional(types.boolean, false),
  zoomby: types.optional(types.string, "1.1"),

  showlabels: types.optional(types.boolean, false),

  zoomcontrol: types.optional(types.boolean, false),
  brightnesscontrol: types.optional(types.boolean, false),
  contrastcontrol: types.optional(types.boolean, false),
  rotatecontrol: types.optional(types.boolean, false),
  crosshair: types.optional(types.boolean, false),
});

const IMAGE_CONSTANTS = {
  rectangleModel: "RectangleModel",
  rectangleLabelsModel: "RectangleLabelsModel",
  ellipseModel: "EllipseModel",
  ellipseLabelsModel: "EllipseLabelsModel",
  brushLabelsModel: "BrushLabelsModel",
  rectanglelabels: "rectanglelabels",
  keypointlabels: "keypointlabels",
  polygonlabels: "polygonlabels",
  brushlabels: "brushlabels",
  brushModel: "BrushModel",
  ellipselabels: "ellipselabels",
};

const Model = types
  .model({
    type: "image",

    // tools: types.array(BaseTool),

    rotation: types.optional(types.number, 0),

    sizeUpdated: types.optional(types.boolean, false),

    /**
     * Natural sizes of Image
     * Constants
     */
    naturalWidth: types.optional(types.integer, 1),
    naturalHeight: types.optional(types.integer, 1),

    /**
     * Initial width and height of the image
     */
    initialWidth: types.optional(types.integer, 1),
    initialHeight: types.optional(types.integer, 1),

    stageWidth: types.optional(types.integer, 1),
    stageHeight: types.optional(types.integer, 1),

    /**
     * Zoom Scale
     */
    zoomScale: types.optional(types.number, 1),

    /**
     * Coordinates of left top corner
     * Default: { x: 0, y: 0 }
     */
    zoomingPositionX: types.maybeNull(types.number),
    zoomingPositionY: types.maybeNull(types.number),

    /**
     * Brightness of Canvas
     */
    brightnessGrade: types.optional(types.number, 100),

    contrastGrade: types.optional(types.number, 100),

    /**
     * Cursor coordinates
     */
    cursorPositionX: types.optional(types.number, 0),
    cursorPositionY: types.optional(types.number, 0),

    brushControl: types.optional(types.string, "brush"),

    brushStrokeWidth: types.optional(types.number, 15),

    /**
     * Mode
     * brush for Image Segmentation
     * eraser for Image Segmentation
     */
    mode: types.optional(types.enumeration(["drawing", "viewing", "brush", "eraser"]), "viewing"),

    regions: types.array(
      types.union(BrushRegionModel, RectRegionModel, EllipseRegionModel, PolygonRegionModel, KeyPointRegionModel),
      [],
    ),
  })
  .volatile(self => ({
    currentImage: 0,
    stageRatio: 1,
    containerWidth: 1,
    containerHeight: 1,
    targetWidth: 0,
  }))
  .views(self => ({
    get store() {
      return getRoot(self);
    },

    get expectedWidth() {
      return self.width ? self.targetWidth : self.naturalWidth;
    },

    get expectedHeight() {
      return self.width ? self.targetWidth / self.naturalWidth * self.naturalHeight : self.naturalHeight;
    },

    get parsedValue() {
      return parseValue(self.value, self.store.task.dataObj);
    },

    // @todo the name is for backward compatibility; change the name later
    get _value() {
      const value = self.parsedValue;
      if (Array.isArray(value)) return value[self.currentImage];
      return value;
    },

    get images() {
      const value = self.parsedValue;
      if (!value) return [];
      if (Array.isArray(value)) return value;
      return [value];
    },

    /**
     * @return {boolean}
     */
    get hasStates() {
      const states = self.states();
      return states && states.length > 0;
    },

    get regs() {
      return self.annotation?.regionStore.regions.filter(r => r.object === self) || [];
    },

    get selectedShape() {
      return self.regs.find(r => r.selected);
    },

    get stageTranslate() {
      return {
        0: { x: 0, y: 0 },
        90: { x: 0, y: self.stageHeight },
        180: { x: self.stageWidth, y: self.stageHeight },
        270: { x: self.stageWidth, y: 0 },
      }[self.rotation];
    },

    get stageScale() {
      return self.zoomScale * self.stageRatio;
    },

    get imageScale() {
      return Math.max(self.expectedWidth * self.zoomScale / self.containerWidth, self.expectedHeight * self.zoomScale / self.containerHeight);
    },

    /**
     * @return {object}
     */
    states() {
      return self.annotation.toNames.get(self.name);
    },

    activeStates() {
      const states = self.states();
      return states && states.filter(s => s.isSelected && s.type.includes("labels"));
    },

    controlButton() {
      const names = self.states();
      if (!names || names.length === 0) return;

      let returnedControl = names[0];

      names.forEach(item => {
        if (
          item.type === IMAGE_CONSTANTS.rectanglelabels ||
          item.type === IMAGE_CONSTANTS.brushlabels ||
          item.type === IMAGE_CONSTANTS.ellipselabels
        ) {
          returnedControl = item;
        }
      });

      return returnedControl;
    },

    get controlButtonType() {
      const name = self.controlButton();
      return getType(name).name;
    },

    get stageComponentSize() {
      if ((self.rotation + 360) % 180 === 90) {
        return {
          width: self.stageHeight,
          height: self.stageWidth,
        };
      }
      return {
        width: self.stageWidth,
        height: self.stageHeight,
      };
    },

    get zoomBy() {
      return parseFloat(self.zoomby);
    },

    get imageTransform() {
      const imgStyle = {
        width: `${self.stageComponentSize.width}px`,
        height: `${self.stageComponentSize.height}px`,
        transformOrigin: "left top",
        transform: "none",
        filter: `brightness(${self.brightnessGrade}%) contrast(${self.contrastGrade}%)`,
      };
      const imgTransform = [];
      if (self.imageScale !== 1) {
        const { zoomingPositionX, zoomingPositionY } = self;
        imgTransform.push("translate3d(" + zoomingPositionX + "px," + zoomingPositionY + "px, 0)");
        imgTransform.push("scale3d(" + self.imageScale + ", " + self.imageScale + ", 1)");
      }

      if (self.rotation) {
        const translate = {
          90: `0, -100%`,
          180: `-100%, -100%`,
          270: `-100%, 0`,
        };

        // there is a top left origin already set for zoom; so translate+rotate
        imgTransform.push(`rotate(${self.rotation}deg)`);
        imgTransform.push(`translate(${translate[self.rotation] || "0, 0"})`);

      }

      if (imgTransform?.length > 0) {
        imgStyle.transform = imgTransform.join(" ");
      }
      return imgStyle;
    }
  }))

  // actions for the tools
  .actions(self => {
    const toolsManager = new ToolsManager({ obj: self });

    function afterCreate() {
      if (self.zoomcontrol) toolsManager.addTool("zoom", Tools.Zoom.create({}, { manager: toolsManager }));

      if (self.brightnesscontrol)
        toolsManager.addTool("brightness", Tools.Brightness.create({}, { manager: toolsManager }));

      if (self.contrastcontrol) toolsManager.addTool("contrast", Tools.Contrast.create({}, { manager: toolsManager }));

      if (self.rotatecontrol) toolsManager.addTool("rotate", Tools.Rotate.create({}, { manager: toolsManager }));
    }

    function getToolsManager() {
      return toolsManager;
    }

    return { afterCreate, getToolsManager };
  })
  .extend(self => {
    let skipInteractions = false;
    return {
      views: {
        getSkipInteractions() {
          return skipInteractions;
        },
      },
      actions: {
        setSkipInteractions(value) {
          skipInteractions = value;
        },
      },
    };
  })
  .actions(self => ({
    freezeHistory() {
      //self.annotation.history.freeze();
    },

    updateBrushControl(arg) {
      self.brushControl = arg;
    },

    updateBrushStrokeWidth(arg) {
      self.brushStrokeWidth = arg;
    },

    /**
     * Update brightnessGrade of Image
     * @param {number} value
     */
    setBrightnessGrade(value) {
      self.brightnessGrade = value;
    },

    setContrastGrade(value) {
      self.contrastGrade = value;
    },

    setGridSize(value) {
      self.gridSize = value;
    },

    setCurrentImage(i) {
      self.currentImage = i;
    },

    /**
     * Set pointer of X and Y
     */
    setPointerPosition({ x, y }) {
      self.freezeHistory();
      self.cursorPositionX = x;
      self.cursorPositionY = y;
    },

    /**
     * Set zoom
     */
    setZoom(scale, x, y) {
      self.resize = scale;
      self.zoomScale = scale;
      self.setZoomPosition(x, y);
      self._recalculateImageParams();
    },

    setZoomPosition(x, y) {
      self.zoomingPositionX = clamp(
        x,
        self.stageComponentSize.width - self.stageComponentSize.width * self.imageScale,
        0,
      );
      self.zoomingPositionY = clamp(
        y,
        self.stageComponentSize.height - self.stageComponentSize.height * self.imageScale,
        0,
      );
    },

    handleZoom(val, mouseRelativePos = { x: self.stageWidth / 2, y: self.stageHeight / 2 }) {
      if (val) {
        self.freezeHistory();
        const stage = self.stageRef;
        let stageScale = self.stageScale;
        let zoomScale = self.zoomScale;

        let mouseAbsolutePos;
        let zoomingPosition;
        window.stage = stage;
        mouseAbsolutePos = {
          x: (mouseRelativePos.x - self.zoomingPositionX) / stageScale,
          y: (mouseRelativePos.y - self.zoomingPositionY) / stageScale,
        };

        stageScale = val > 0 ? stageScale * self.zoomBy : stageScale / self.zoomBy;
        zoomScale = val > 0 ? zoomScale * self.zoomBy : zoomScale / self.zoomBy;

        zoomingPosition = {
          x: -(mouseAbsolutePos.x - mouseRelativePos.x / stageScale) * stageScale,
          y: -(mouseAbsolutePos.y - mouseRelativePos.y / stageScale) * stageScale,
        };
        if (self.negativezoom !== true && zoomScale <= 1) {
          self.setZoom(1, 0, 0);
          return;
        }
        if (zoomScale <= 1) {
          self.setZoom(zoomScale, 0, 0);
          return;
        }
        self.setZoom(zoomScale, zoomingPosition.x, zoomingPosition.y);
      }
    },

    /**
     * Set mode of Image (drawing and viewing)
     * @param {string} mode
     */
    setMode(mode) {
      self.mode = mode;
    },

    setImageRef(ref) {
      self.imageRef = ref;
    },

    setStageRef(ref) {
      self.stageRef = ref;

      const currentTool = self.getToolsManager().findSelectedTool();
      currentTool?.updateCursor?.();

      // Konva updates ref repeatedly and this breaks brush scaling
      if (self.initialWidth > 1) return;
      self.initialWidth = ref && ref.attrs && ref.attrs.width ? ref.attrs.width : 1;
      self.initialHeight = ref && ref.attrs && ref.attrs.height ? ref.attrs.height : 1;
    },

    // @todo remove
    setSelected(shape) {
      // self.selectedShape = shape;
    },

    rotate(degree = -90) {
      self.rotation = (self.rotation + degree + 360) % 360;
      let ratioK = 1 / self.stageRatio;
      if ((self.rotation + 360) % 180 === 90) {
        self.stageRatio = self.naturalWidth / self.naturalHeight;
      } else {
        self.stageRatio = 1;
      }
      ratioK = ratioK * self.stageRatio;
      if (degree === -90) {
        this.setZoomPosition(
          self.zoomingPositionY * ratioK,
          self.stageComponentSize.height -
            self.zoomingPositionX * ratioK -
            self.stageComponentSize.height * self.imageScale,
        );
      }
      if (degree === 90) {
        this.setZoomPosition(
          self.stageComponentSize.width -
            self.zoomingPositionY * ratioK -
            self.stageComponentSize.width * self.imageScale,
          self.zoomingPositionX * ratioK,
        );
      }
    },

    _recalculateImageParams() {
      if ((self.rotation + 360) % 180 === 90) {
        let k = Math.min(self.containerWidth / self.expectedHeight, self.containerHeight / self.expectedWidth, self.zoomScale);
        self.stageWidth = Math.round(self.expectedWidth * k);
        self.stageHeight = Math.round(self.expectedHeight *  k);
      } else {
        const k = Math.min(self.containerWidth / self.expectedWidth, self.containerHeight / self.expectedHeight, self.zoomScale);
        self.stageWidth = Math.round(self.expectedWidth * k);
        self.stageHeight = Math.round(self.expectedHeight * k);
      }
      self.setZoomPosition(self.zoomingPositionX, self.zoomingPositionY);
    },

    setTargetWidth(targetWidth) {
      self.targetWidth = targetWidth;
    },

    _updateImageSize({ width, height, naturalWidth, naturalHeight, userResize}) {
      if (naturalWidth !== undefined) {
        self.naturalWidth = naturalWidth;
        self.naturalHeight = naturalHeight;
      }
      if (width > 1 && height > 1) {
        self.containerWidth = width;
        self.containerHeight = height;
        self._recalculateImageParams();
      }

      self.sizeUpdated = true;
      self._updateRegionsSizes({
        width: self.stageWidth,
        height: self.stageHeight,
        naturalWidth,
        naturalHeight,
        userResize,
      });
    },

    _updateRegionsSizes({ width, height, naturalWidth, naturalHeight, userResize }) {
      self.regions.forEach(shape => {
        shape.updateImageSize(width / naturalWidth, height / naturalHeight, width, height, userResize);
      });
      self.regs.forEach(shape => {
        shape.updateImageSize(width / naturalWidth, height / naturalHeight, width, height, userResize);
      });
    },

    updateImageSize(ev) {
      const { width, height, naturalWidth, naturalHeight } = ev.target;
      self.initialWidth = width;
      self.initialHeight = height;
      self._updateImageSize({ width, height, naturalWidth, naturalHeight });
      // after regions' sizes adjustment we have to reset all saved history changes
      // mobx do some batch update here, so we have to reset it asynchronously
      // this happens only after initial load, so it's safe
      setTimeout(self.annotation.reinitHistory, 0);
    },

    checkLabels() {
      // there is should be at least one state selected for *labels object
      const labelStates = (self.states() || []).filter(s => s.type.includes("labels"));
      const selectedStates = self.getAvailableStates();
      return selectedStates.length !== 0 || labelStates.length === 0;
    },

    addShape(shape) {
      self.regions.push(shape);

      self.annotation.addRegion(shape);
      self.setSelected(shape.id);
      shape.selectRegion();
    },

    // convert screen coords to image coords considering zoom
    fixZoomedCoords([x, y]) {
      if (!self.stageRef) {
        return [x, y];
      }

      // good official way, but maybe a bit slower and with repeating cloning
      const p = self.stageRef
        .getAbsoluteTransform()
        .copy()
        .invert()
        .point({ x, y });
      return [p.x, p.y];
    },

    // convert image coords to screen coords considering zoom
    zoomOriginalCoords([x, y]) {
      const p = self.stageRef.getAbsoluteTransform().point({ x, y });
      return [p.x, p.y];
    },

    /**
     * @typedef {number[]|{ x: number, y: number }} Point
     */

    /**
     * @callback PointFn
     * @param {Point} point
     * @returns Point
     */

    /**
     * Wrap point operations to convert zoomed coords from screen to image and back
     * Good for event handlers, receiving screen coords, but working with image coords
     * Accepts both [x, y] and {x, y} points; preserves this format
     * @param {PointFn} fn wrapped function do some math with image coords
     * @return {PointFn} outer function do some math with screen coords
     */
    fixForZoom(fn) {
      return p => {
        const asArray = p.x === undefined;
        const [x, y] = self.fixZoomedCoords(asArray ? p : [p.x, p.y]);
        const modified = fn(asArray ? [x, y] : { x, y });
        const zoomed = self.zoomOriginalCoords(asArray ? modified : [modified.x, modified.y]);
        return asArray ? zoomed : { x: zoomed[0], y: zoomed[1] };
      };
    },

    /**
     * Resize of image canvas
     * @param {*} width
     * @param {*} height
     */
    onResize(width, height, userResize) {
      self._updateImageSize({ width, height, userResize });
    },

    event(name, ev, ...coords) {
      self.getToolsManager().event(name, ev.evt || ev, ...self.fixZoomedCoords(coords));
    },

    /**
     * Transform JSON data (annotations and predictions) to format
     */
    fromStateJSON(obj, fromModel) {
      const tools = self.getToolsManager().allTools();

      // when there is only the image classification and nothing else, we need to handle it here
      if (tools.length === 0 && obj.value.choices) {
        self.annotation.names.get(obj.from_name).fromStateJSON(obj);

        return;
      }

      tools.forEach(t => t.fromStateJSON && t.fromStateJSON(obj, fromModel));
    },
  }));

const ImageModel = types.compose("ImageModel", TagAttrs, Model, ObjectBase, AnnotationMixin);

const HtxImage = inject("store")(ImageView);

Registry.addTag("image", ImageModel, HtxImage);
Registry.addObjectType(ImageModel);

export { ImageModel, HtxImage };
