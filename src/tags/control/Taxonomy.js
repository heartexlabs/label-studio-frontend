import React from "react";
import { observer } from "mobx-react";
import { types, getRoot } from "mobx-state-tree";

import Registry from "../../core/Registry";
import VisibilityMixin from "../../mixins/Visibility";
import ControlBase from "./Base";
import Types from "../../core/Types";
import { ChoiceModel } from "./Choice"; // eslint-disable-line no-unused-vars
import { guidGenerator } from "../../core/Helpers";

import DropdownTreeSelect from "react-dropdown-tree-select";
import "react-dropdown-tree-select/dist/styles.css";

/**
 * Taxonomy tag allows to select one or more hierarchical labels
 * storing both label and their ancestors.
 * @example
 * <View>
 *   <Taxonomy name="media" toName="text">
 *     <Choice value="Online">
 *       <Choice value="UGC" />
 *       <Choice value="Free" />
 *       <Choice value="Paywall">
 *         <Choice value="NYC Times" />
 *         <Choice value="The Wall Street Journal" />
 *       </Choice>
 *     </Choice>
 *     <Choice value="Offline" />
 *   </Taxonomy>
 *   <Text name="text" value="You'd never believe what he did to the country" />
 * </View>
 * @name Taxonomy
 * @param {string} name                - Name of the group
 * @param {string} toName              - Name of the element that you want to label
 */
const TagAttrs = types.model({
  name: types.identifier,
  toname: types.maybeNull(types.string),
  maxusages: types.maybeNull(types.number),
});

const Model = types
  .model({
    pid: types.optional(types.string, guidGenerator),

    readonly: types.optional(types.boolean, false),

    type: "taxonomy",
    children: Types.unionArray(["choice"]),
  })
  .volatile(() => ({
    maxUsagesReached: false,
  }))
  .views(self => ({
    get annotation() {
      return getRoot(self).annotationStore.selected;
    },

    get holdsState() {
      return true;
    },

    get valueType() {
      return "taxonomy";
    },

    get result() {
      if (self.perregion) {
        const area = self.annotation.highlightedNode;
        if (!area) return null;

        return self.annotation.results.find(r => r.from_name === self && r.area === area);
      }
      return self.annotation.results.find(r => r.from_name === self);
    },
  }))
  .actions(self => {
    // RDTS is uncontrolled component, so it handles selected values by itself.
    // We store path for selected items and store them separately for serialization.
    // It shall not trigger rerender every time, so it's not observable.
    let selected = [];

    return {
      needsUpdate() {
        if (self.result) selected = self.result.mainValue;
        else selected = [];
        self.maxUsagesReached = selected.length >= self.maxusages;
      },

      selectedValues() {
        return selected;
      },

      onChange(node, checked) {
        selected = checked.map(s => s.path);
        self.maxUsagesReached = selected.length >= self.maxusages;

        if (self.result) {
          self.result.area.setValue(self);
        } else {
          if (self.perregion) {
            const area = self.annotation.highlightedNode;
            if (!area) return null;
            area.setValue(self);
          } else {
            self.annotation.createResult({}, { taxonomy: selected }, self, self.toname);
          }
        }
      },

      traverse(root) {
        const maxusages = self.maxusages;
        const visitNode = function(node, parents = []) {
          const label = node.value;
          const path = [...parents, label];
          // @todo this check is heavy for long lists, optimize
          // search through last items in every stored path
          // if it's not saved as selected RDTS should handle it by its own, so undefined
          const checked = selected.some(p => p.length && p[p.length - 1] === label) || undefined;
          const disabled = !checked && maxusages && selected.length >= maxusages;
          const obj = { label, path, checked, disabled };

          if (node.children) {
            obj.children = node.children.map(n => visitNode(n, path));
          }

          return obj;
        };

        return Array.isArray(root) ? root.map(n => visitNode(n)) : visitNode(root);
      },
    };
  });

const TaxonomyModel = types.compose("TaxonomyModel", ControlBase, TagAttrs, Model, VisibilityMixin);

const HtxTaxonomy = observer(({ item }) => {
  const style = { marginTop: "1em", marginBottom: "1em" };

  return (
    <div style={{ ...style }}>
      <DropdownTreeSelect
        key={item.maxUsagesReached}
        data={item.traverse(item.children)}
        onChange={item.onChange}
        texts={{ placeholder: "Click to add..." }}
        inlineSearchInput
        showPartiallySelected
      />
    </div>
  );
});

Registry.addTag("taxonomy", TaxonomyModel, HtxTaxonomy);

export { HtxTaxonomy, TaxonomyModel, TagAttrs };
