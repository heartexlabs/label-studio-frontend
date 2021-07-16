import React, { Component, createRef, forwardRef, Fragment, memo, useState } from "react";
import { Stage, Layer, Group, Line } from "react-konva";
import { observer } from "mobx-react";
import { getRoot, isAlive } from "mobx-state-tree";

import ImageGrid from "../ImageGrid/ImageGrid";
import ImageTransformer from "../ImageTransformer/ImageTransformer";
import ObjectTag from "../../components/Tags/Object";
import Tree from "../../core/Tree";
import styles from "./ImageView.module.scss";
import { errorBuilder } from "../../core/DataValidator/ConfigValidator";
import { chunks, findClosestParent } from "../../utils/utilities";
import Konva from "konva";
import { observe } from "mobx";
import { guidGenerator } from "../../utils/unique";

Konva.showWarnings = false;

const splitRegions = (regions) => {
  const brushRegions = [];
  const shapeRegions = [];
  const l = regions.length;
  let i = 0;

  for(i; i < l; i++) {
    const region = regions[i];

    if (region.type === "brushregion") {
      brushRegions.push(region);
    } else {
      shapeRegions.push(region);
    }
  }

  return {
    brushRegions,
    shapeRegions,
  };
};

const Region = memo(({region}) => {
  return Tree.renderItem(region, false);
});

const RegionsLayer = memo(({regions, name, useLayers}) => {
  const content = regions.map((el) => (
    <Region key={`region-${el.id}`} region={el}/>
  ));

  return useLayers === false ? (
    content
  ) : (
    <Layer name={name}>
      {content}
    </Layer>
  );
});

const Regions = memo(({regions, useLayers = true}) => {
  return chunks(regions, 15).map((chunk, i) => (
    <RegionsLayer
      key={`chunk-${i}`}
      name={`chunk-${i}`}
      regions={chunk}
      useLayers={useLayers}
    />
  ));
});

const DrawingRegion = observer(({item}) => {
  const {drawingRegion} = item;
  const Wrapper = drawingRegion && drawingRegion.type === "brushregion" ? Fragment: Layer;
  return <Wrapper>
    {drawingRegion?<Region key={`drawing`} region={drawingRegion}/>:drawingRegion}
  </Wrapper>;
});

const Crosshair = memo(forwardRef(({width, height}, ref) => {
  const [pointsV, setPointsV] = useState([50, 0, 50, height]);
  const [pointsH, setPointsH] = useState([0, 100, width, 100]);
  const [x, setX] = useState(100);
  const [y, setY] = useState(50);

  const [visible, setVisible] = useState(false);
  const strokeWidth = 1;
  const dashStyle = [3,3];

  if (ref) {
    ref.current = {
      updatePointer(newX, newY) {
        if (newX !== x) {
          setX(newX);
          setPointsV([newX, 0, newX, height]);
        }

        if (newY !== y) {
          setY(newY);
          setPointsH([0, newY, width, newY]);
        }
      },
      updateVisibility(visibility) {
        setVisible(visibility);
      }
    };
  }

  return (
    <Layer
      name="crosshair"
      listening={false}
      opacity={visible ? 0.6 : 0}
    >
      <Group>
        <Line
          name="v-white"
          points={pointsH}
          stroke="#fff"
          strokeWidth={strokeWidth}
        />
        <Line
          name="v-black"
          points={pointsH}
          stroke="#000"
          strokeWidth={strokeWidth}
          dash={dashStyle}
        />
      </Group>
      <Group>
        <Line
          name="h-white"
          points={pointsV}
          stroke="#fff"
          strokeWidth={strokeWidth}
        />
        <Line
          name="h-black"
          points={pointsV}
          stroke="#000"
          strokeWidth={strokeWidth}
          dash={dashStyle}
        />
      </Group>
    </Layer>
  );
}));

export default observer(
  class ImageView extends Component {
    // stored position of canvas before creating region
    canvasX;
    canvasY;
    lastOffsetWidth = -1;
    propsObserverDispose = [];
    state = {
      imgStyle: {},
      ratio: 1,
      pointer: [0, 0]
    }

    imageRef = createRef();
    crosshairRef = createRef();

    handleOnClick = e => {
      const { item } = this.props;
      let evt = e.evt || e;
      return item.event("click", evt, evt.offsetX, evt.offsetY);
    };

    handleMouseDown = e => {
      const { item } = this.props;
      item.setSkipInteractions(e.evt && (e.evt.metaKey || e.evt.ctrlKey));

      // item.freezeHistory();
      const p = e.target.getParent();

      if (p && p.className === "Transformer") return;

      if (
        // create regions over another regions with Cmd/Ctrl pressed
        (e.evt && (e.evt.metaKey || e.evt.ctrlKey)) ||
        e.target === e.target.getStage() ||
        findClosestParent(
          e.target,
          el => el.nodeType === "Group" && ["ruler", "segmentation"].indexOf(el?.attrs?.name) > -1,
        )
      ) {
        window.addEventListener("mousemove", this.handleGlobalMouseMove);
        window.addEventListener("mouseup", this.handleGlobalMouseUp);
        const { offsetX: x, offsetY: y } = e.evt;
        // store the canvas coords for calculations in further events
        const { left, top } = this.container.getBoundingClientRect();
        this.canvasX = left;
        this.canvasY = top;
        return item.event("mousedown", e, x, y);
      }

      return true;
    };

    /**
     * Mouse up outside the canvas
     */
    handleGlobalMouseUp = e => {
      window.removeEventListener("mousemove", this.handleGlobalMouseMove);
      window.removeEventListener("mouseup", this.handleGlobalMouseUp);

      if (e.target && e.target.tagName === "CANVAS") return;

      const { item } = this.props;
      const { clientX: x, clientY: y } = e;

      item.freezeHistory();

      return item.event("mouseup", e, x - this.canvasX, y - this.canvasY);
    };

    handleGlobalMouseMove = e => {
      if (e.target && e.target.tagName === "CANVAS") return;

      const { item } = this.props;
      const { clientX: x, clientY: y } = e;

      return item.event("mousemove", e, x - this.canvasX, y - this.canvasY);
    };

    /**
     * Mouse up on Stage
     */
    handleMouseUp = e => {
      const { item } = this.props;

      item.freezeHistory();

      return item.event("mouseup", e, e.evt.offsetX, e.evt.offsetY);
    };

    handleMouseMove = e => {
      const { item } = this.props;

      item.freezeHistory();

      this.updateCrosshair(e);

      if (e.evt && (e.evt.buttons === 4 || (e.evt.buttons === 1 && e.evt.shiftKey)) && item.zoomScale > 1) {
        e.evt.preventDefault();
        const newPos = { x: item.zoomingPositionX + e.evt.movementX, y: item.zoomingPositionY + e.evt.movementY };
        item.setZoomPosition(newPos.x, newPos.y);
      } else {
        item.event("mousemove", e, e.evt.offsetX, e.evt.offsetY);
      }
    };

    updateCrosshair = (e) => {
      if (this.crosshairRef.current) {
        const {x, y} = e.currentTarget.getPointerPosition();
        this.crosshairRef.current.updatePointer(x, y);
      }
    }

    handleError = () => {
      const { item, store } = this.props;
      const cs = store.annotationStore;

      cs.addErrors([
        errorBuilder.generalError(`Cannot load image (${item._value}).\nCheck console/network panel for more info.`),
      ]);
    };

    updateGridSize = range => {
      const { item } = this.props;
      item.freezeHistory();

      item.setGridSize(range);
    };

    /**
     * Handle to zoom
     */
    handleZoom = e => {
      /**
       * Disable if user doesn't use ctrl
       */
      if (e.evt && !e.evt.ctrlKey) {
        return;
      } else if (e.evt && e.evt.ctrlKey) {
        /**
         * Disable scrolling page
         */
        e.evt.preventDefault();
      }
      if (e.evt) {
        const { item } = this.props;
        const stage = item.stageRef;
        item.handleZoom(e.evt.deltaY, stage.getPointerPosition());
      }
    };

    renderRulers() {
      const { item } = this.props;
      const width = 1;
      const color = "white";

      return (
        <Group
          name="ruler"
          onClick={ev => {
            ev.cancelBubble = false;
          }}
        >
          <Line
            x={0}
            y={item.cursorPositionY}
            points={[0, 0, item.stageWidth, 0]}
            strokeWidth={width}
            stroke={color}
            tension={0}
            dash={[4, 4]}
            closed
          />
          <Line
            x={item.cursorPositionX}
            y={0}
            points={[0, 0, 0, item.stageHeight]}
            strokeWidth={width}
            stroke={color}
            tension={0}
            dash={[1.5]}
            closed
          />
        </Group>
      );
    }

    onResize = () => {
      if (!this.container) return;
      if (this.container.offsetWidth <= 1) return;
      if (this.lastOffsetWidth === this.container.offsetWidth) return;

      this.props.item.onResize(this.container.offsetWidth, this.container.offsetHeight, true);
      this.lastOffsetWidth = this.container.offsetWidth;
    };

    componentDidMount() {
      window.addEventListener("resize", this.onResize);

      if (this.props.item && isAlive(this.props.item)) {
        this.updateImageTransform();
        this.observerObjectUpdate();
      }
    }

    componentWillUnmount() {
      window.removeEventListener("resize", this.onResize);
      this.propsObserverDispose.forEach(dispose => dispose());
    }

    componentDidUpdate(prevProps) {
      this.onResize();

      if (prevProps.item !== this.props.item && isAlive(this.props.item)) {
        this.observerObjectUpdate();
      }
    }

    observerObjectUpdate(){
      this.propsObserverDispose.forEach(dispose => dispose());
      this.propsObserverDispose = [
        'width',
        'brightnessGrade',
        'contrastGrade',
        'zoomScale',
        'resize',
        'rotation',
        'naturalWidth',
        'naturalHeight',
        'zoomingPositionY',
        'zoomingPositionX',
      ].map((prop) => {
        return observe(this.props.item, prop, this.updateImageTransform, true);
      });
    }

    updateImageTransform = () => {
      const { item } = this.props;

      let ratio = 1;

      const imgStyle = {
        width: item.width,
        transformOrigin: "left top",
        transform: 'none',
        filter: `brightness(${item.brightnessGrade}%) contrast(${item.contrastGrade}%)`,
      };

      const imgTransform = [];

      if (item.zoomScale !== 1) {
        const { zoomingPositionX, zoomingPositionY } = item;
        imgTransform.push("translate(" + zoomingPositionX + "px," + zoomingPositionY + "px)");
        imgTransform.push("scale(" + item.resize + ", " + item.resize + ")");
      }

      if (item.rotation) {
        const translate = {
          90: `0, -100%`,
          180: `-100%, -100%`,
          270: `-100%, 0`,
        };

        // there is a top left origin already set for zoom; so translate+rotate
        imgTransform.push(`rotate(${item.rotation}deg)`);
        imgTransform.push(`translate(${translate[item.rotation] || "0, 0"})`);

        if ([90, 270].includes(item.rotation)) {
          // we can not rotate img itself, so we change container's size via css margin hack, ...
          ratio = item.naturalWidth / item.naturalHeight;
          // ... prepare image size for transform rotation and use position: absolute
          imgStyle.width = `${ratio * 100}%`;
        }
      }

      if (imgTransform?.length > 0) {
        imgStyle.transform = imgTransform.join(" ");
      }

      if (this.imageRef.current) {
        Object.assign(this.imageRef.current.style, imgStyle);
      }

      if (this.state.ratio !== ratio) {
        this.setState({ ratio });
      }
    }

    renderTools() {
      const { item, store } = this.props;
      const cs = store.annotationStore;

      if (cs.viewingAllAnnotations || cs.viewingAllPredictions) return null;

      return (
        <div className={styles.block}>
          {item
            .getToolsManager()
            .allTools()
            .map(tool => {
              return <Fragment key={guidGenerator()}>{tool.viewClass}</Fragment>;
            })}
        </div>
      );
    }

    render() {
      const { item, store } = this.props;

      // @todo stupid but required check for `resetState()`
      // when Image tries to render itself after detouching
      if (!isAlive(item)) return null;

      // TODO fix me
      if (!store.task || !item._value) return null;

      const selected = item.selectedShape;
      const regions = item.regs.filter(r => r !== selected);
      const cb = item.controlButton();
      const containerStyle = {};

      let containerClassName = styles.container;

      if (this.state.ratio !== 1) {
        containerClassName += " " + styles.rotated;
      }

      if (getRoot(item).settings.fullscreen === false) {
        containerStyle["maxWidth"] = item.maxwidth;
      }

      const {brushRegions, shapeRegions} = splitRegions(regions);

      return (
        <ObjectTag
          item={item}
          className={item.images.length > 1 ? styles.withGallery : styles.wrapper}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div
            ref={node => {
              this.container = node;
            }}
            className={containerClassName}
            style={containerStyle}
          >
            {this.state.ratio !== 1 && (
              <div
                className={styles.filler}
                style={{ marginTop: `${this.state.ratio * 100}%`, width: item.stageWidth }}
              />
            )}
            <img
              ref={ref => {
                item.setImageRef(ref);
                this.imageRef.current = ref;
              }}
              src={item._value}
              onLoad={item.updateImageSize}
              onError={this.handleError}
              onClick={this.handleOnClick}
              alt="LS"
            />
          </div>
          {/* @todo this is dirty hack; rewrite to proper async waiting for data to load */}
          {item.stageWidth <= 1 ? null : (
            <Stage
              ref={ref => {
                item.setStageRef(ref);
              }}
              style={{ position: "absolute", top: 0, left: 0, brightness: "150%" }}
              className={"image-element"}
              width={item.stageComponentSize.width}
              height={item.stageComponentSize.height}
              scaleX={item.stageScale}
              scaleY={item.stageScale}
              x={item.zoomingPositionX}
              y={item.zoomingPositionY}
              offsetX={item.stageTranslate.x}
              offsetY={item.stageTranslate.y}
              rotation={item.rotation}
              onClick={this.handleOnClick}
              onMouseEnter={() => {
                if (this.crosshairRef.current) {
                  this.crosshairRef.current.updateVisibility(true);
                }
              }}
              onMouseLeave={() => {
                if (this.crosshairRef.current) {
                  this.crosshairRef.current.updateVisibility(false);
                }
              }}
              onDragMove={this.updateCrosshair}
              onMouseDown={this.handleMouseDown}
              onMouseMove={this.handleMouseMove}
              onMouseUp={this.handleMouseUp}
              onWheel={item.zoom ? this.handleZoom : () => {}}
            >
              {regions.length === 0 && (
                <Layer>
                  <Line points={[0,0,0,1]} stroke="rgba(0,0,0,0)"/>
                </Layer>
              )}

              {item.grid && item.sizeUpdated && <ImageGrid item={item} />}

              {brushRegions.length > 0 && (
                <Regions
                  name="brushes"
                  regions={brushRegions}
                  useLayers={false}
                />
              )}

              {shapeRegions.length > 0 && (
                <Regions
                  name="shapes"
                  regions={shapeRegions}
                />
              )}

              {selected && (
                (selected.type === 'brushregion') ? (
                  Tree.renderItem(selected)
                ) : (
                  <Layer name="selected">
                    {Tree.renderItem(selected)}
                    {selected.type !== 'brushregion' && selected.editable && (
                      <ImageTransformer rotateEnabled={cb && cb.canrotate} selectedShape={item.selectedShape} />
                    )}
                  </Layer>
                )
              )}

              <DrawingRegion item={item}/>

              {item.crosshair && (
                <Crosshair
                  ref={this.crosshairRef}
                  width={item.stageComponentSize.width}
                  height={item.stageComponentSize.height}
                />
              )}
            </Stage>
          )}
          {this.renderTools()}
          {item.images.length > 1 && (
            <div className={styles.gallery}>
              {item.images.map((src, i) => (
                <img
                  alt=""
                  key={src}
                  src={src}
                  className={i === item.currentImage && styles.active}
                  height="60"
                  onClick={() => item.setCurrentImage(i)}
                />
              ))}
            </div>
          )}
        </ObjectTag>
      );
    }
  },
);
