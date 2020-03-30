import React from "react";
import { Form } from "antd";
import { observer } from "mobx-react";
import { types, getRoot, getParent } from "mobx-state-tree";

import InfoModal from "../../components/Infomodal/Infomodal";
import Registry from "../../core/Registry";
import SelectedModelMixin from "../../mixins/SelectedModel";
import Tree from "../../core/Tree";
import Types from "../../core/Types";
import { ChoiceModel } from "./Choice"; // eslint-disable-line no-unused-vars
import { guidGenerator } from "../../core/Helpers";

/**
 * Choices tag, create a group of choices, radio, or checkboxes. Shall
 * be used for a single or multi-class classification.
 * @example
 * <View>
 *   <Choices name="gender" toName="txt-1" choice="single-radio">
 *     <Choice alias="M" value="Male" />
 *     <Choice alias="F" value="Female" />
 *   </Choices>
 *   <Text name="txt-1" value="John went to see Marry" />
 * </View>
 * @name Choices
 * @param {string} name                - name of the group
 * @param {string} toName              - name of the element that you want to label
 * @param {single|single-radio|multiple} [choice=single] - single or multi-class
 * @param {boolean} [showInline=false] - show items in the same visual line
 * @param {boolean} [required=false]   - validation if choice has been selected
 * @param {string} [requiredMessage]   - message to show if validation fails
 */
const TagAttrs = types.model({
  name: types.string,
  toname: types.maybeNull(types.string),
  showinline: types.optional(types.boolean, false),
  choice: types.optional(types.enumeration(["single", "single-radio", "multiple"]), "single"),
  required: types.optional(types.boolean, false),
  requiredmessage: types.maybeNull(types.string),
  perregion: types.optional(types.boolean, false),

  readonly: types.optional(types.boolean, false),
});

const Model = types
  .model({
    id: types.optional(types.identifier, guidGenerator),
    pid: types.optional(types.string, guidGenerator),

    type: "choices",
    children: Types.unionArray(["choice", "view", "header", "hypertext"]),
  })
  .views(self => ({
    get shouldBeUnselected() {
      return self.choice === "single" || self.choice === "single-radio";
    },

    get completion() {
      return getRoot(self).completionStore.selected;
    },

    states() {
      return self.completion.toNames.get(self.name);
    },
  }))
  .actions(self => ({
    validate() {
      const fn = item => {
        const names = item.getSelectedNames();
        if (names.length === 0) InfoModal.warning(item.requiredmessage || `Checkbox "${item.name}" is required.`);
      };

      // if (self.perregion === true) {
      //     // find all regions that are connected to this
      //     const objectTag = self.completion.names.get(self.toname);
      //     let me = null;

      //     for (var i = 0; i <= objectTag.regions.length; i++) {
      //         const reg = objectTag.regions[i];
      //         me = reg.states.find(s => s.name === self.name);
      //         if (me)
      //             break;
      //     }

      //     if (! me) {

      //     } else {
      //         if (me.getSelectedNames().length === 0) {
      //             const region = getParent(me);
      //             self.completion.regionStore.unselectAll();
      //             region.selectRegion();
      //             InfoModal.warning(self.requiredmessage || `Checkbox "${self.name}" is required.`);
      //             return false;
      //         }
      //     }
      // } else {
      // validation when its classifying the whole object, not magic here
      if (self.getSelectedNames().length === 0) {
        InfoModal.warning(self.requiredmessage || `Checkbox "${self.name}" is required.`);
        return false;
      }
      // }

      return true;
    },

    copyState(choices) {
      choices.getSelectedNames().forEach(l => {
        self.findLabel(l).setSelected(true);
      });
    },

    toStateJSON() {
      const names = self.getSelectedNames();

      if (names && names.length) {
        const toname = self.toname || self.name;
        return {
          id: self.pid,
          from_name: self.name,
          to_name: toname,
          type: self.type,
          value: {
            choices: names,
          },
        };
      }
    },

    fromStateJSON(obj, fromModel) {
      self.unselectAll();

      if (!obj.value.choices) throw new Error("No labels param");

      if (obj.id) self.pid = obj.id;

      console.log(obj);

      self.readonly = obj.readonly;

      obj.value.choices.forEach(l => {
        const choice = self.findLabel(l);

        if (!choice) throw new Error("No label " + l);

        choice.setSelected(true);
      });
    },
  }));

const ChoicesModel = types.compose(
  "ChoicesModel",
  Model,
  TagAttrs,
  SelectedModelMixin.props({ _child: "ChoiceModel" }),
);

const HtxChoices = observer(({ item }) => {
  const style = { marginTop: "1em", marginBottom: "1em" };
  const region = item.completion.highlightedNode;
  const visibleStyle = !item.perregion || region ? {} : { display: "none" };

  return (
    <div style={{ ...style, ...visibleStyle }}>
      {item.showinline ? (
        <Form layout="horizontal" style={{ display: "flex" }}>
          {Tree.renderChildren(item)}
        </Form>
      ) : (
        <Form layout="vertical">{Tree.renderChildren(item)}</Form>
      )}
    </div>
  );
});

Registry.addTag("choices", ChoicesModel, HtxChoices);

export { HtxChoices, ChoicesModel, TagAttrs };
