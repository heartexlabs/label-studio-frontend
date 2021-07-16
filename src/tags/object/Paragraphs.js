import React, { Component } from "react";
import { observer, inject } from "mobx-react";
import { types, getRoot } from "mobx-state-tree";
import ColorScheme from "pleasejs";
import { Button } from "antd";
import { PauseCircleOutlined, PlayCircleOutlined } from "@ant-design/icons";

import ObjectBase from "./Base";
import ObjectTag from "../../components/Tags/Object";
import RegionsMixin from "../../mixins/Regions";
import Registry from "../../core/Registry";
import Utils from "../../utils";
import { ParagraphsRegionModel } from "../../regions/ParagraphsRegion";
import { restoreNewsnapshot } from "../../core/Helpers";
import { splitBoundaries, findNodeAt } from "../../utils/html";
import { parseValue } from "../../utils/data";
import messages from "../../utils/messages";
import styles from "./Paragraphs/Paragraphs.module.scss";
import { errorBuilder } from "../../core/DataValidator/ConfigValidator";
import { AnnotationMixin } from "../../mixins/AnnotationMixin";

/**
 * Paragraphs tag shows paragraph markup that can be labeled.
 * it expects an array of objects like this: [{ $nameKey: "Author name", $textKey: "Text" }, ... ]
 * @example
 * <View>
 *   <Paragraphs name="dialogue-1" value="$dialogue" layout="dialogue" />
 * </View>
 * @name Paragraphs
 * @param {string} name                  - Name of the element
 * @param {string} value                 - Value of the element
 * @param {json|url} [valueType=json]    - Where the data is stored — directly in uploaded JSON data or needs to be loaded from a URL
 * @param {string} audioUrl              - Audio to sync phrases with
 * @param {boolean} [showPlayer=false]   - Whether to show audio player above the paragraphs
 * @param {no|yes} [saveTextResult=yes]  - Whether to save `text` to `value` or not
 * @param {none|dialogue} [layout=none]  - The styles layout to use
 * @param {string} [nameKey=author]      - The name key to use
 * @param {string} [textKey=text]        - The text key to use
 */
const TagAttrs = types.model("ParagraphsModel", {
  name: types.identifier,
  value: types.maybeNull(types.string),
  valuetype: types.optional(types.enumeration(["json", "url"]), () => (window.LS_SECURE_MODE ? "url" : "json")),
  audiourl: types.maybeNull(types.string),
  showplayer: false,

  highlightcolor: types.maybeNull(types.string),
  showlabels: types.optional(types.boolean, false),

  layout: types.optional(types.enumeration(["none", "dialogue"]), "none"),

  // @todo add `valueType=url` to Paragraphs and make autodetection of `savetextresult`
  savetextresult: types.optional(types.enumeration(["none", "no", "yes"]), () =>
    window.LS_SECURE_MODE ? "no" : "yes",
  ),

  namekey: types.optional(types.string, "author"),
  textkey: types.optional(types.string, "text"),
});

const Model = types
  .model("ParagraphsModel", {
    type: "paragraphs",
    _update: types.optional(types.number, 1),
  })
  .views(self => ({
    get hasStates() {
      const states = self.states();
      return states && states.length > 0;
    },

    get store() {
      return getRoot(self);
    },

    get audio() {
      if (!self.audiourl) return null;
      if (self.audiourl[0] === "$") {
        const store = getRoot(self);
        const val = self.audiourl.substr(1);
        return store.task.dataObj[val];
      }
      return self.audiourl;
    },

    get regs() {
      return self.annotation.regionStore.regions.filter(r => r.object === self);
    },

    layoutStyles(data) {
      if (self.layout === "dialogue") {
        const seed = data[self.namekey];
        return {
          phrase: { backgroundColor: Utils.Colors.convertToRGBA(ColorScheme.make_color({ seed: seed })[0], 0.25) },
        };
      }

      return {};
    },

    get layoutClasses() {
      if (self.layout === "dialogue") {
        return {
          name: styles.dialoguename,
          text: styles.dialoguetext,
        };
      }

      return {
        name: styles.name,
        text: styles.text,
      };
    },

    states() {
      return self.annotation.toNames.get(self.name);
    },

    activeStates() {
      const states = self.states();
      return states && states.filter(s => s.isSelected && s._type === "paragraphlabels");
    },
  }))
  .volatile(self => ({
    _value: "",
    playingId: -1,
  }))
  .actions(self => {
    const audioRef = React.createRef();
    let audioStopHandler = null;
    let endDuration = 0;
    let currentId = -1;

    function stop() {
      const audio = audioRef.current;
      if (audio.paused) return;
      if (audio.currentTime < endDuration) {
        stopIn(endDuration - audio.currentTime);
        return;
      }
      audioStopHandler = null;
      endDuration = 0;
      audio.pause();
      self.reset();
    }

    function stopIn(seconds) {
      audioStopHandler = window.setTimeout(stop, 1000 * seconds);
    }

    return {
      getRef() {
        return audioRef;
      },

      reset() {
        currentId = -1;
        self.playingId = -1;
      },

      play(idx) {
        const value = self._value[idx] || {};
        const { start, duration } = value;
        const end = duration ? start + duration : value.end || 0;
        if (!audioRef || isNaN(start) || isNaN(end)) return;
        const audio = audioRef.current;

        if (audioStopHandler) {
          window.clearTimeout(audioStopHandler);
          audioStopHandler = null;
        }
        if (!audio.paused) {
          audio.pause();
          self.playingId = -1;
          if (idx === currentId) return;
        }
        if (idx !== currentId) {
          audio.currentTime = start;
        }
        audio.play();
        endDuration = end;
        self.playingId = idx;
        currentId = idx;
        end && stopIn(end - start);
      },
    };
  })
  .actions(self => ({
    needsUpdate() {
      self._update = self._update + 1;
    },

    updateValue(store) {
      const value = parseValue(self.value, store.task.dataObj);

      if (self.valuetype === "url") {
        const url = value;
        if (!/^https?:\/\//.test(url)) {
          const message = [];
          if (url) {
            message.push(`URL (${url}) is not valid.`);
            message.push(`You should not put data directly into your task if you use valuetype="url".`);
          } else {
            message.push(`URL is empty, check ${value} in data JSON.`);
          }
          if (window.LS_SECURE_MODE) message.unshift(`In SECURE MODE valuetype set to "url" by default.`);
          store.annotationStore.addErrors([errorBuilder.generalError(message.join("\n"))]);
          self.setRemoteValue("");
          return;
        }
        fetch(url)
          .then(res => {
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            return res.json();
          })
          .then(self.setRemoteValue)
          .catch(e => {
            const message = messages.ERR_LOADING_HTTP({ attr: self.value, error: String(e), url });
            store.annotationStore.addErrors([errorBuilder.generalError(message)]);
            self.setRemoteValue("");
          });
      } else {
        self.setRemoteValue(value);
      }
    },

    setRemoteValue(val) {
      let errors = [];
      if (!Array.isArray(val)) {
        errors.push(`Provided data is not an array`);
      } else {
        if (!(self.namekey in val[0])) {
          errors.push(`"${self.namekey}" field not found in task data; check your <b>nameKey</b> parameter`);
        }
        if (!(self.textkey in val[0])) {
          errors.push(`"${self.textkey}" field not found in task data; check your <b>textKey</b> parameter`);
        }
      }
      if (errors.length) {
        const general = [
          `Task data (provided as <b>${self.value}</b>) has wrong format.<br/>`,
          `It should be an array of objects with fields,`,
          `defined by <b>nameKey</b> ("author" by default)`,
          `and <b>textKey</b> ("text" by default)`,
        ].join(" ");
        self.store.annotationStore.addErrors([
          errorBuilder.generalError(`${general}<ul>${errors.map(error => `<li>${error}</li>`).join("")}</ul>`),
        ]);
        return;
      }
      self._value = val;
      self.needsUpdate();
    },

    createRegion(p) {
      const r = ParagraphsRegionModel.create({
        pid: p.id,
        ...p,
      });

      r._range = p._range;

      self.regions.push(r);
      self.annotation.addRegion(r);

      return r;
    },

    addRegion(range) {
      const states = self.activeStates();
      if (states.length === 0) return;

      const control = states[0];
      const labels = { [control.valueType]: control.selectedValues() };
      const area = self.annotation.createResult(range, labels, control, self);
      area._range = range._range;
      return area;
    },

    /**
     *
     * @param {*} obj
     * @param {*} fromModel
     */
    fromStateJSON(obj, fromModel) {
      const { start, startOffset, end, endOffset, text } = obj.value;

      if (fromModel.type === "textarea" || fromModel.type === "choices") {
        self.annotation.names.get(obj.from_name).fromStateJSON(obj);
        return;
      }

      const states = restoreNewsnapshot(fromModel);

      const tree = {
        pid: obj.id,
        parentID: obj.parent_id === null ? "" : obj.parent_id,

        startOffset: startOffset,
        endOffset: endOffset,

        start,
        end,

        text,
        score: obj.score,
        readonly: obj.readonly,
        flagged: obj.flagged,
        normalization: obj.normalization,
        states: [states],
      };

      states.fromStateJSON(obj);

      self.createRegion(tree);

      self.needsUpdate();
    },
  }));

const ParagraphsModel = types.compose("ParagraphsModel", RegionsMixin, TagAttrs, Model, ObjectBase, AnnotationMixin);

class HtxParagraphsView extends Component {
  constructor(props) {
    super(props);
    this.myRef = React.createRef();
  }

  getSelectionText(sel) {
    return sel.toString();
  }

  getPhraseElement(node) {
    const cls = this.props.item.layoutClasses;
    while (node && (!node.classList || !node.classList.contains(cls.text))) node = node.parentNode;
    return node;
  }

  getOffsetInPhraseElement(container, offset) {
    const node = this.getPhraseElement(container);
    let range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(container, offset);
    const fullOffset = range.toString().length;
    const phraseIndex = [...node.parentNode.parentNode.children].indexOf(node.parentNode);
    const phraseNode = node;
    return [fullOffset, phraseNode, phraseIndex];
  }

  captureDocumentSelection() {
    const cls = this.props.item.layoutClasses;
    const names = [...this.myRef.current.getElementsByClassName(cls.name)];
    names.forEach(el => {
      el.style.visibility = "hidden";
    });

    var i,
      ranges = [],
      selection = window.getSelection();

    if (selection.isCollapsed) {
      names.forEach(el => {
        el.style.visibility = "unset";
      });
      return [];
    }

    for (i = 0; i < selection.rangeCount; i++) {
      var r = selection.getRangeAt(i);

      if (r.endContainer.nodeName === "DIV") {
        r.setEnd(r.startContainer, r.startContainer.length);
      }

      if (r.collapsed || /^\s*$/.test(r.toString())) continue;

      try {
        splitBoundaries(r);
        const [startOffset, , start] = this.getOffsetInPhraseElement(r.startContainer, r.startOffset);
        const [endOffset, , end] = this.getOffsetInPhraseElement(r.endContainer, r.endOffset);

        // user selection always has only one range, so we can use selection's text
        // which doesn't contain hidden elements (names in our case)
        ranges.push({
          startOffset,
          start: String(start),
          endOffset,
          end: String(end),
          _range: r,
          text: selection.toString(),
        });
      } catch (err) {
        console.error("Can not get selection", err);
      }
    }

    names.forEach(el => {
      el.style.visibility = "unset";
    });

    // BrowserRange#normalize() modifies the DOM structure and deselects the
    // underlying text as a result. So here we remove the selected ranges and
    // reapply the new ones.
    selection.removeAllRanges();

    return ranges;
  }

  onMouseUp(ev) {
    const item = this.props.item;
    var selectedRanges = this.captureDocumentSelection();
    const states = item.activeStates();

    if (!states || states.length === 0) return;

    if (selectedRanges.length === 0) {
      return;
    }

    item._currentSpan = null;

    const htxRange = item.addRegion(selectedRanges[0]);

    const spans = htxRange.createSpans();
    htxRange.addEventsToSpans(spans);
  }

  _handleUpdate() {
    const root = this.myRef.current;
    const { item } = this.props;

    // wait until text is loaded
    if (!item._value) return;

    item.regs.forEach(function(r, i) {
      // spans can be totally missed if this is app init or undo/redo
      // or they can be disconnected from DOM on annotations switching
      // so we have to recreate them from regions data
      if (r._spans?.[0]?.isConnected) return;

      try {
        const phrases = root.children;
        const range = document.createRange();
        const startNode = phrases[r.start].getElementsByClassName(item.layoutClasses.text)[0];
        const endNode = phrases[r.end].getElementsByClassName(item.layoutClasses.text)[0];
        let { startOffset, endOffset } = r;

        range.setStart(...findNodeAt(startNode, startOffset));
        range.setEnd(...findNodeAt(endNode, endOffset));

        if (r.text && range.toString().replace(/\s+/g, "") !== r.text.replace(/\s+/g, "")) {
          console.info("Restore broken position", i, range.toString(), "->", r.text, r);
          if (
            // span breaks the mock-up by its end, so the start of next one is wrong
            item.regs.slice(0, i).some(other => r.start === other.end) &&
            // for now there are no fallback for huge wrong regions
            r.start === r.end
          ) {
            // find region's text in the node (disregarding spaces)
            const match = startNode.textContent.match(new RegExp(r.text.replace(/\s+/g, "\\s+")));
            if (!match) console.warn("Can't find the text", r);
            const { index = 0 } = match || {};
            if (r.endOffset - r.startOffset !== r.text.length)
              console.warn("Text length differs from region length; possible regions overlap");
            startOffset = index;
            endOffset = startOffset + r.text.length;

            range.setStart(...findNodeAt(startNode, startOffset));
            range.setEnd(...findNodeAt(endNode, endOffset));
            r.fixOffsets(startOffset, endOffset);
          }
        } else if (!r.text && range.toString()) {
          r.setText(range.toString());
        }

        splitBoundaries(range);

        r._range = range;
        const spans = r.createSpans();
        r.addEventsToSpans(spans);
      } catch (err) {
        console.log(err, r);
      }
    });

    Array.from(this.myRef.current.getElementsByTagName("a")).forEach(a => {
      a.addEventListener("click", function(ev) {
        ev.preventDefault();
        return false;
      });
    });
  }

  componentDidUpdate() {
    this._handleUpdate();
  }

  componentDidMount() {
    this._handleUpdate();
  }

  render() {
    const { item } = this.props;
    const withAudio = !!item.audio;

    return (
      <ObjectTag item={item}>
        {withAudio && (
          <audio
            controls={item.showplayer}
            className={styles.audio}
            src={item.audio}
            ref={item.getRef()}
            onEnded={item.reset}
          />
        )}
        <div
          ref={this.myRef}
          data-update={item._update}
          className={styles.container}
          onMouseUp={this.onMouseUp.bind(this)}
          // dangerouslySetInnerHTML={{ __html: val }}
        >
          <Phrases item={item} />
        </div>
      </ObjectTag>
    );
  }
}

const Phrases = observer(({ item }) => {
  const cls = item.layoutClasses;
  const withAudio = !!item.audio;

  if (!item._value) return null;

  const val = item._value.map((v, idx) => {
    const style = item.layoutStyles(v);
    const classNames = [styles.phrase];
    if (withAudio) classNames.push(styles.withAudio);
    if (getRoot(item).settings.showLineNumbers) classNames.push(styles.numbered);

    return (
      <div key={`${item.name}-${idx}`} className={classNames.join(" ")} style={style.phrase}>
        {withAudio && !isNaN(v.start) && (
          <Button
            type="text"
            className={styles.play}
            icon={item.playingId === idx ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={() => item.play(idx)}
          />
        )}
        <span className={cls.name}>{v[item.namekey]}</span>
        <span className={cls.text}>{v[item.textkey]}</span>
      </div>
    );
  });

  return val;
});

const HtxParagraphs = inject("store")(observer(HtxParagraphsView));

Registry.addTag("paragraphs", ParagraphsModel, HtxParagraphs);
Registry.addObjectType(ParagraphsModel);

export { ParagraphsModel, HtxParagraphs };
