import External from "../core/External";
import Messages from "../utils/messages";

/**
 * Text
 */
import { DialogueAnalysis } from "../examples/dialogue_analysis"; // eslint-disable-line no-unused-vars
import { NamedEntity } from "../examples/named_entity"; // eslint-disable-line no-unused-vars
import { References } from "../examples/references"; // eslint-disable-line no-unused-vars
import { Required } from "../examples/required"; // eslint-disable-line no-unused-vars
import { Sentiment } from "../examples/sentiment_analysis"; // eslint-disable-line no-unused-vars
import { Nested as NestedSimple } from "../examples/nested_choices"; // eslint-disable-line no-unused-vars
import { Nested } from "../examples/nested_choices/complicated"; // eslint-disable-line no-unused-vars
import { Dialogue } from "../examples/phrases"; // eslint-disable-line no-unused-vars

/**
 * Audio
 */
import { AudioClassification } from "../examples/audio_classification"; // eslint-disable-line no-unused-vars
import { AudioRegions } from "../examples/audio_regions"; // eslint-disable-line no-unused-vars
import { TranscribeAudio } from "../examples/transcribe_audio"; // eslint-disable-line no-unused-vars

/**
 * Image
 */
import { ImageBbox } from "../examples/image_bbox"; // eslint-disable-line no-unused-vars
import { ImageKeyPoint } from "../examples/image_keypoints"; // eslint-disable-line no-unused-vars
import { ImageMultilabel } from "../examples/image_multilabel"; // eslint-disable-line no-unused-vars
import { ImageEllipselabels } from "../examples/image_ellipses"; // eslint-disable-line no-unused-vars
import { ImagePolygons } from "../examples/image_polygons"; // eslint-disable-line no-unused-vars
import { ImageSegmentation } from "../examples/image_segmentation"; // eslint-disable-line no-unused-vars

/**
 * HTML
 */
import { HTMLDocument } from "../examples/html_document"; // eslint-disable-line no-unused-vars
import { Taxonomy } from "../examples/taxonomy"; // eslint-disable-line no-unused-vars

/**
 * Different
 */
import { Pairwise } from "../examples/pairwise"; // eslint-disable-line no-unused-vars

import { TimeSeries } from "../examples/timeseries"; // eslint-disable-line no-unused-vars

/**
 * Custom Data
 */
// import { AllTypes } from "../examples/all_types"; // eslint-disable-line no-unused-vars

const data = Taxonomy;

/**
 * Get current config
 * @param {string} pathToConfig
 */
async function getConfig(pathToConfig) {
  const response = await fetch(pathToConfig);
  const config = await response.text();
  return config;
}

/**
 * Get custom config
 */
async function getExample() {
  let datatype = data;

  let config = await getConfig(datatype.config);
  let task = {
    data: JSON.stringify(datatype.tasks[0].data),
  };
  let annotations = datatype.annotation.annotations;
  let predictions = datatype.tasks[0].predictions;

  return { config, task, annotations, predictions };
}

/**
 * Function to return App element
 */
function rootElement(element) {
  const el = document.createElement("div");

  let root;

  if (typeof element === "string") {
    root = document.getElementById(element);
  } else {
    root = element;
  }

  root.innerHTML = "";
  root.appendChild(el);

  root.style.width = "auto";

  return el;
}

/**
 * Function to configure application with callbacks
 * @param {object} params
 */
function configureApplication(params) {
  const options = {
    alert: m => console.log(m), // Noop for demo: window.alert(m)
    messages: { ...Messages, ...params.messages },
    onSubmitAnnotation: params.onSubmitAnnotation ? params.onSubmitAnnotation : External.onSubmitAnnotation,
    onUpdateAnnotation: params.onUpdateAnnotation ? params.onUpdateAnnotation : External.onUpdateAnnotation,
    onDeleteAnnotation: params.onDeleteAnnotation ? params.onDeleteAnnotation : External.onDeleteAnnotation,
    onSkipTask: params.onSkipTask ? params.onSkipTask : External.onSkipTask,
    onSubmitDraft: params.onSubmitDraft || External.onSubmitDraft,
    onTaskLoad: params.onTaskLoad ? params.onTaskLoad : External.onTaskLoad,
    onLabelStudioLoad: params.onLabelStudioLoad ? params.onLabelStudioLoad : External.onLabelStudioLoad,
    onEntityCreate: params.onEntityCreate || External.onEntityCreate,
    onEntityDelete: params.onEntityDelete || External.onEntityDelete,
    onGroundTruth: params.onGroundTruth || External.onGroundTruth,
    onSelectAnnotation: params.onSelectAnnotation || External.onSelectAnnotation,
  };

  return options;
}

export default { rootElement, getExample, configureApplication };
