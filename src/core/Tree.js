import React from "react";
import { getType, getParentOfType } from "mobx-state-tree";
import xml2js from "xml2js";
import { variableNotation } from "./Template";

import Registry from "./Registry";
import { guidGenerator } from "./Helpers";

export const TRAVERSE_SKIP = "skip";
export const TRAVERSE_STOP = "stop";

/**
 * Clone React Tree
 * @param {*} items
 * @param {*} attrs
 */
function cloneReactTree(items, attrs) {
  let clone = null;
  clone = function(children) {
    const res = [];

    React.Children.forEach(children, function(child) {
      let el;

      if (child.props) {
        let moreProps = {};

        if (typeof attrs === "function") {
          moreProps = attrs(child);
        } else if (typeof attrs === "object") {
          moreProps = attrs;
        }

        el = React.cloneElement(child, moreProps, clone(child.props.children));
      } else {
        el = child;
      }

      res.push(el);
    });

    return res;
  };

  return clone(items);
}

/**
 * Function to convert CSS string to object
 * @param {string} style
 * @returns {object}
 */
function cssConverter(style) {
  if (!style) return null;

  let result = {},
    attributes = style.split(";"),
    firstIndexOfColon,
    i,
    key,
    value;

  for (i = 0; i < attributes.length; i++) {
    firstIndexOfColon = attributes[i].indexOf(":");
    key = attributes[i].substring(0, firstIndexOfColon);
    value = attributes[i].substring(firstIndexOfColon + 1);

    key = key.replace(/ /g, "");
    if (key.length < 1) {
      continue;
    }

    if (value[0] === " ") {
      value = value.substring(1);
    }

    if (value[value.length - 1] === " ") {
      value = value.substring(0, value.length - 1);
    }

    var ukey = key.replace(/(-.)/g, x => x[1].toUpperCase());

    result[ukey] = value;
  }

  return result;
}

/**
 *
 * @param {*} attrs
 */
function attrsToProps(attrs) {
  const props = {};

  if (!attrs) return props;

  for (let item of Object.keys(attrs)) {
    /**
     * Convert node of Tree to boolean value
     */
    if (item !== "value" && (attrs[item] === "true" || attrs[item] === "false")) {
      props[item.toLowerCase()] = JSON.parse(attrs[item]);
    } else {
      props[item.toLowerCase()] = attrs[item];
    }
  }

  return props;
}

/**
 *
 * @param {string} html
 */
function treeToModel(html, store) {
  /**
   * Remove all line breaks from a string
   * @param {string}
   * @returns {string}
   */
  function removeAllBreaks(data) {
    return data.replace(/(\r\n|\n|\r)/gm, "");
  }

  /**
   * Edit all self closing tags from XML View
   * TODO: Fix bug: if the value of <Choice /> or another tag contains "/>" function return error
   * @param {string} data
   * @returns {string}
   */
  function editSelfClosingTags(data) {
    let split = data.split("/>");
    let newData = "";

    for (let i = 0; i < split.length - 1; i++) {
      let edsplit = split[i].split("<");
      newData += split[i] + "></" + edsplit[edsplit.length - 1].split(" ")[0] + ">";
    }

    return newData + split[split.length - 1];
  }

  // TODO: this code shall be replaced with a proper XML tree
  // rendering, as of right now, problem is that xml2js doesn't
  // support that with the additional attributes used to parse the
  // tree.
  let htseen = -1;
  const hypertexts = (function() {
    let m;
    const res = [];
    const re = /<HyperText.*?>(.*?)<\/HyperText>/gi;
    do {
      m = re.exec(html);
      if (m) {
        res.push(m[1]);
      }
    } while (m);

    return res;
  })();

  function findHT() {
    htseen = htseen + 1;
    return hypertexts[htseen];
  }

  function cloneXmlTreeAndReplaceKeys(root, idx, indexFlag = "{{idx}}") {
    function recursiveClone(node) {
      let copy = {};
      for (let key in node) {
        if (key === '$$') {
          copy["$$"] = node["$$"].map(c => recursiveClone(c));
        } else if (key === '$') {
          copy["$"] = recursiveClone(node["$"]);
        } else if (typeof node[key] === 'string') {
          copy[key] = node[key].replace(indexFlag, idx);
        } else {
          copy[key] = node[key];
        }
      }

      return copy;
    }


    return recursiveClone(root);
  }


  /**
   * Generate new node
   * @param {object} node
   */
  function addNode(node) {
    if (!node.$$) return null;

    // if it's a hypertext process the children differently, that's
    // done for convenience. value attribute takes precedence if present
    if (node["#name"].toLowerCase() === "hypertext") {
      return node.$ && "value" in node.$ ? node.$["value"] : findHT(node);
    }

    let text = null;
    const res = [];

    for (let chld of node.$$) {
      if (chld["#name"].toLowerCase() === "repeater") {
        const repeaterArray = variableNotation(chld.$['on'], store.task.dataObj) || [];

        for (let i = 0; i < repeaterArray.length; i++) {
          let createdView = buildData({ "#name": "View" });

          const cloned = cloneXmlTreeAndReplaceKeys(chld, i, chld.$['indexFlag']);
          createdView.children = addNode(cloned);
  
          res.push(createdView);
        }
      }
      else if (chld["#name"] !== "__text__") {
        const data = buildData(chld);
        const children = addNode(chld);

        if (children) {
          if (typeof children === "string") data["value"] = children;
          else data.children = children;
        }

        res.push(data);
      } else {
        text = chld._;
      }
    }

    return res.length === 0 ? text : res;
  }

  /**
   * Generate obj with main data
   */
  function buildData(node) {
    const data = attrsToProps(node.$);
    const type = node["#name"].toLowerCase();

    /**
     * Generation id of node
     */
    data["id"] = guidGenerator();

    /**
     * Build type name
     */
    data["type"] = type;
    data["tagName"] = node["#name"];

    return data;
  }

  const htmlWithotBreaks = removeAllBreaks(html);
  const htmlSelfClosingTags = editSelfClosingTags(htmlWithotBreaks);
  let document;

  // it's actually a sync function, but there is no sync interface
  // because of some backwards compat
  xml2js.parseString(
    htmlSelfClosingTags,
    {
      explicitChildren: true,
      preserveChildrenOrder: true,
      charsAsChildren: true,
    },
    function(err, result) {
      if (err) throw err;
      document = result;
    },
  );

  const root = buildData(Object.values(document)[0]);
  root.children = addNode(Object.values(document)[0]);

  return root;
}

/**
 * Render items of tree
 * @param {*} el
 */
function renderItem(el, includeKey = true) {
  const type = getType(el);
  const identifierAttribute = type.identifierAttribute;
  const typeName = type.name;
  const View = Registry.getViewByModel(typeName);

  if (!View) {
    throw new Error(`No view for model: ${typeName}`);
  }
  const key = el[identifierAttribute] || guidGenerator();
  return <View key={includeKey ? key : undefined} item={el} />;
}

/**
 *
 * @param {*} item
 */
function renderChildren(item) {
  if (item && item.children && item.children.length) {
    return item.children.map(el => {
      return renderItem(el);
    });
  } else {
    return null;
  }
}

/**
 *
 * @param {*} name
 * @param {*} tree
 */
function findInterface(name, tree) {
  let fn;
  fn = function(node) {
    if (getType(node).name === name) return node;

    if (node.children) {
      for (let chld of node.children) {
        const res = fn(chld);
        if (res) return res;
      }
    }
  };

  return fn(tree);
}

/**
 *
 * @param {*} obj
 * @param {*} classes
 */
function findParentOfType(obj, classes) {
  for (let c of classes) {
    try {
      const p = getParentOfType(obj, c);
      if (p) return p;
    } catch (err) {
      console.err(err);
    }
  }

  return null;
}

/**
 *
 * @param {*} obj
 * @param {*} classes
 */
function filterChildrenOfType(obj, classes) {
  const res = [];
  if (!Array.isArray(classes)) classes = [classes];

  traverseTree(obj, function(node) {
    for (let c of classes) {
      if (getType(node).name === c) res.push(node);
    }
  });

  return res;
}

function traverseTree(root, cb) {
  let visitNode;

  visitNode = function(node) {
    const res = cb(node);
    if (res === TRAVERSE_SKIP) return;
    if (res === TRAVERSE_STOP) return TRAVERSE_STOP;

    if (node.children) {
      for (let chld of node.children) {
        const visit = visitNode(chld);
        if (visit === TRAVERSE_STOP) return TRAVERSE_STOP;
      }
    }
  };

  visitNode(root);
}

export default {
  cloneReactTree,
  renderItem,
  renderChildren,
  treeToModel,
  findInterface,
  findParentOfType,
  filterChildrenOfType,
  cssConverter,
  traverseTree,
};
