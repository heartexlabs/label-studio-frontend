import { types, getType, getRoot } from "mobx-state-tree";
import { observer, inject } from "mobx-react";

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

/**
 * Image tag shows an image on the page
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
 * @param {string} name                       - name of the element
 * @param {string} value                      - value
 * @param {string=} [width=100%]              - image width
 * @param {string=} [maxWidth=750px]          - image maximum width
 * @param {boolean=} [zoom=false]             - enable zooming an image by the mouse wheel
 * @param {boolean=} [negativeZoom=false]     - enable zooming out an image
 * @param {float=} [zoomBy=1.1]               - scale factor
 * @param {boolean=} [grid=false]             - show grid
 * @param {number=} [gridSize=30]             - size of the grid
 * @param {string=} [gridColor="#EEEEF4"]     - color of the grid, opacity is 0.15
 * @param {boolean} [zoomControl=false]       - show zoom controls in toolbar
 * @param {boolean} [reverseZoom=false]       - reverse zoom direction (scroll up = zoom in when true)
 * @param {boolean} [brightnessControl=false] - show brightness control in toolbar
 * @param {boolean} [contrastControl=false]   - show contrast control in toolbar
 * @param {boolean} [rotateControl=false]     - show rotate control in toolbar
 */
const TagAttrs = types.model({
  name: types.maybeNull(types.string),
  value: types.maybeNull(types.string),
  resize: types.maybeNull(types.number),
  width: types.optional(types.string, "100%"),
  maxwidth: types.optional(types.string, "750px"),

  // rulers: types.optional(types.boolean, true),
  grid: types.optional(types.boolean, false),
  gridSize: types.optional(types.number, 30),
  gridColor: types.optional(types.string, "#EEEEF4"),

  zoom: types.optional(types.boolean, false),
  negativezoom: types.optional(types.boolean, false),
  zoomby: types.optional(types.string, "1.1"),

  showlabels: types.optional(types.boolean, false),

  zoomcontrol: types.optional(types.boolean, false),
  reversezoom: types.optional(types.boolean, false),
  brightnesscontrol: types.optional(types.boolean, false),
  contrastcontrol: types.optional(types.boolean, false),
  rotatecontrol: types.optional(types.boolean, false),
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
    id: types.identifier,
    type: "image",
    _value: types.optional(types.string, ""),

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

    selectedShape: types.safeReference(
      types.union(BrushRegionModel, RectRegionModel, EllipseRegionModel, PolygonRegionModel, KeyPointRegionModel),
    ),

    regions: types.array(
      types.union(BrushRegionModel, RectRegionModel, EllipseRegionModel, PolygonRegionModel, KeyPointRegionModel),
      [],
    ),
  })
  .views(self => ({
    /**
     * @return {boolean}
     */
    get hasStates() {
      const states = self.states();
      return states && states.length > 0;
    },

    /**
     * @return {object}
     */
    get completion() {
      // return Types.getParentOfTypeString(self, "Completion");
      return getRoot(self).completionStore.selected;
    },

    /**
     * @return {object}
     */
    states() {
      return self.completion.toNames.get(self.name);
    },

    activeStates() {
      const states = self.states();
      return states && states.filter(s => s.isSelected && s._type.includes("labels"));
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

  .actions(self => ({
    freezeHistory() {
      //self.completion.history.freeze();
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
      self.zoomingPositionX = x;
      self.zoomingPositionY = y;
    },

    setZoomPosition(x, y) {
      self.zoomingPositionX = x;
      self.zoomingPositionY = y;
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
      // Konva updates ref repeatedly and this breaks brush scaling
      if (self.initialWidth > 1) return;
      self.initialWidth = ref && ref.attrs && ref.attrs.width ? ref.attrs.width : 1;
      self.initialHeight = ref && ref.attrs && ref.attrs.height ? ref.attrs.height : 1;
    },

    setSelected(shape) {
      self.selectedShape = shape;
    },

    rotate(degree = -90) {
      self.rotation = (self.rotation + degree + 360) % 360;

      // 1. swap canvas sizes to correct relative calculations
      const w = self.stageWidth;
      self.stageWidth = self.stageHeight;
      self.stageHeight = w;
      const nw = self.naturalWidth;
      self.naturalWidth = self.naturalHeight;
      self.naturalHeight = nw;

      const ratio = self.stageHeight / self.stageWidth;

      // 2. rotate regions
      self.regions.forEach(s => s.rotate(degree));

      // 3. scale to fit original width and resize all regions
      self._updateImageSize({
        width: w,
        height: Math.round(ratio * w),
        naturalWidth: self.naturalWidth,
        naturalHeight: self.naturalHeight,
      });
    },

    _updateImageSize({ width, height, naturalWidth, naturalHeight, userResize }) {
      if (naturalWidth !== undefined) {
        self.naturalWidth = naturalWidth;
        self.naturalHeight = naturalHeight;
      }

      self.stageWidth = width;
      self.stageHeight = height;
      self.sizeUpdated = true;

      self.regions.forEach(shape => {
        shape.updateImageSize(width / naturalWidth, height / naturalHeight, width, height, userResize);
      });
    },

    updateImageSize(ev) {
      const { width, height, naturalWidth, naturalHeight } = ev.target;
      self.initialWidth = width;
      self.initialHeight = height;
      if ((self.rotation + 360) % 180 === 90) {
        // swap sizes
        self._updateImageSize({
          width: height,
          height: width,
          naturalWidth: naturalHeight,
          naturalHeight: naturalWidth,
        });
      } else {
        self._updateImageSize({ width, height, naturalWidth, naturalHeight });
      }
    },

    checkLabels() {
      // there is should be at least one state selected for *labels object
      const labelStates = (self.states() || []).filter(s => s.type.includes("labels"));
      const selectedStates = self.getAvailableStates();
      return selectedStates.length !== 0 || labelStates.length === 0;
    },

    addShape(shape) {
      self.regions.push(shape);

      self.completion.addRegion(shape);
      self.setSelected(shape.id);
      shape.selectRegion();
    },

    // convert screen coords to image coords considering zoom
    fixZoomedCoords([x, y]) {
      return [(x - self.zoomingPositionX) / self.zoomScale, (y - self.zoomingPositionY) / self.zoomScale];
      // good official way, but maybe a bit slower and with repeating cloning
      // const p = self.stageRef.getAbsoluteTransform().copy().invert().point({ x, y });
      // return [p.x, p.y];
    },

    // convert image coords to screen coords considering zoom
    zoomOriginalCoords([x, y]) {
      return [x * self.zoomScale + self.zoomingPositionX, y * self.zoomScale + self.zoomingPositionY];
    },

    /**
     * @typedef {[number, number]|{ x: number, y: number }} Point
     */

    /**
     * Wrap point operations to convert zoomed coords from screen to image and back
     * Good for event handlers, receiving screen coords, but working with image coords
     * Accepts both [x, y] and {x, y} points; preserves this format
     * @param {(point: Point) => Point} fn wrapped function do some math with image coords
     * @return {(point: Point) => Point} outer function do some math with screen coords
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
     * Transform JSON data (completions and predictions) to format
     */
    fromStateJSON(obj, fromModel) {
      const tools = self.getToolsManager().allTools();

      // when there is only the image classification and nothing else, we need to handle it here
      if (tools.length === 0 && obj.value.choices) {
        self.completion.names.get(obj.from_name).fromStateJSON(obj);

        return;
      }

      tools.forEach(t => t.fromStateJSON && t.fromStateJSON(obj, fromModel));
    },
  }));

const ImageModel = types.compose("ImageModel", TagAttrs, Model, ProcessAttrsMixin, ObjectBase);

const HtxImage = inject("store")(observer(ImageView));

Registry.addTag("image", ImageModel, HtxImage);

export { ImageModel, HtxImage };
