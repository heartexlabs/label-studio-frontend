import { types, getParent, destroy, clone } from "mobx-state-tree";
import { guidGenerator } from "../core/Helpers";
import Result from "../regions/Result";
import { defaultStyle } from "../core/Constants";
import { PER_REGION_MODES } from "./PerRegion";

export const AreaMixin = types
  .model({
    id: types.optional(types.identifier, guidGenerator),
    results: types.array(Result),
    parentID: types.maybeNull(types.string),
  })
  .views(self => ({
    // self id without annotation id added to uniquiness across all the tree
    get cleanId() {
      return self.id.replace(/#.*/, "");
    },

    get labeling() {
      return self.results.find(r => r.type.endsWith("labels") && r.hasValue);
    },

    get emptyLabel() {
      return self.results.find(r => r.from_name?.emptyLabel)?.from_name?.emptyLabel;
    },

    get texting() {
      return self.results.find(r => r.type === "textarea" && r.hasValue);
    },

    get tag() {
      return self.labeling?.from_name;
    },

    hasLabel(value) {
      return self.labeling?.mainValue?.includes(value);
    },

    get perRegionTags() {
      return self.annotation.toNames.get(self.object.name)?.filter(tag => tag.perregion) || [];
    },

    get perRegionDescControls() {
      return self.perRegionTags.filter(tag => tag.displaymode === PER_REGION_MODES.REGION_LIST);
    },

    get perRegionFocusTarget() {
      return self.perRegionTags.find(tag => tag.isVisible !== false && tag.focusable);
    },

    get labelName() {
      return self.labeling?.mainValue?.[0] || self.emptyLabel?._value;
    },

    getLabelText(joinstr) {
      const label = self.labeling;
      const text = self.texting?.mainValue?.[0]?.replace(/\n\r|\n/, " ");
      const labelNames = label?.getSelectedString(joinstr);
      const labelText = [];
      if (labelNames) labelText.push(labelNames);
      if (text) labelText.push(text);
      return labelText.join(": ");
    },

    get parent() {
      return self.object;
    },

    get style() {
      const styled = self.results.find(r => r.style);
      if (styled && styled.style) {
        return styled.style;
      }
      const emptyStyled = self.results.find(r => r.emptyStyle);
      return emptyStyled && emptyStyled.emptyStyle;
    },

    // @todo may be slow, consider to add some code to annotation (un)select* methods
    get selected() {
      return self.annotation?.highlightedNode === self;
    },

    getOneColor() {
      return (self.style || defaultStyle).fillcolor;
    },
  }))
  .volatile(self => ({
    // selected: false,
  }))
  .actions(self => ({
    beforeDestroy() {
      self.results.forEach(r => destroy(r));
    },

    setSelected(value) {
      self.selected = value;
    },

    /**
     * Remove region
     */
    deleteRegion() {
      if (!self.annotation.editable) return;
      if (self.selected) self.annotation.unselectAll();
      if (self.destroyRegion) self.destroyRegion();
      self.annotation.deleteRegion(self);
    },

    addResult(r) {
      self.results.push(r);
    },

    removeResult(r) {
      const index = self.results.indexOf(r);
      if (index < 0) return;
      self.results.splice(index, 1);
      destroy(r);
      if (!self.results.length) self.annotation.deleteArea(self);
    },

    setValue(tag) {
      const result = self.results.find(r => r.from_name === tag);
      const values = tag.selectedValues();
      if (result) {
        if (tag.holdsState) result.setValue(values);
        else self.removeResult(result);
      } else {
        self.results.push({
          area: self,
          from_name: tag,
          to_name: self.object,
          type: tag.resultType,
          value: {
            [tag.valueType]: values,
          },
        });
      }
      self.updateAppearenceFromState && self.updateAppearenceFromState();
    },
  }));
