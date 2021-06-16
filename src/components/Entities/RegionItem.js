import { Badge, List } from "antd";
import { observer } from "mobx-react";
import { getRoot, isAlive } from "mobx-state-tree";
import { Button } from "../../common/Button/Button";
import { Node, NodeIcon } from "../Node/Node";
import { LsVisible, LsInvisible, LsExpand, LsCollapse } from "../../assets/icons";
import styles from "./Entities.module.scss";
import Utils from "../../utils";

import { Block, Elem } from "../../utils/bem";
import { isDefined } from "../../utils/utilities";
import "./RegionItem.styl";
import { Space } from "../../common/Space/Space";
import { useCallback, useMemo, useState } from "react";
import { asVars } from "../../utils/styles";
import { PER_REGION_MODES } from "../../mixins/PerRegion";
import Registry from "../../core/Registry";
import * as Color from "../../utils/colors";
import chroma from "chroma-js";

const RegionItemDesc = observer(({ item }) => {
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = useCallback((e) => {
    setCollapsed(val => !val);
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const controls = item.perRegionDescControls || [];
  return <Elem name="desc" tag="div" mod={{ collapsed, empty: !(controls?.length > 0)  }}>
    {controls.map((tag, idx) => {
      const View = Registry.getPerRegionView(tag.type, PER_REGION_MODES.REGION_LIST);
      return View ? <View key={idx} item={tag} area={item} collapsed={collapsed} setCollapsed={setCollapsed}/> : null;
    })}
    <Elem name="collapse" tag={Button} size="small" type="text" onClick={toggleCollapsed}>
      {collapsed ? <LsExpand/> : <LsCollapse/>}
    </Elem>
  </Elem>;
});

const RegionItemContent = observer(({ idx, item }) => {
  return (
    <Block name="region-item" mod={{ hidden : item.hidden}}>
      <Elem name="header" tag="div">
        <Elem name="counter">{isDefined(idx) ? idx + 1 : ""}</Elem>

        <Elem name="title" tag={Node} node={item} mix={styles.node}/>

        <Space size="small">
          <Elem
            tag="span"
            name="id"
          >
            <NodeIcon node={item}/>
          </Elem>

          {!item.editable && <Badge count={"ro"} style={{ backgroundColor: "#ccc" }}/>}

          {item.score && (
            <Elem
              tag="span"
              name="score"
              style={{
                color: Utils.Colors.getScaleGradient(item.score),
              }}
            >
              {item.score.toFixed(2)}
            </Elem>
          )}

          {item.hideable && (
            <Elem
              tag={Button}
              name="toggle"
              size="small"
              type="text"
              mod={{ active: !item.hidden }}
              icon={item.hidden ? <LsInvisible/> : <LsVisible/>}
              onClick={item.toggleHidden}
            />
          )}

        </Space>
      </Elem>
      <RegionItemDesc item={item}/>
    </Block>
  );
});

export const RegionItem = observer(({ item, idx, flat }) => {
  const getVars = useMemo(()=>{
    let vars;
    return () => {
      if (!vars) {
        const color = item.getOneColor();
        vars = color ? asVars({ labelColor: color, labelBgColor: Color.over(chroma(color).alpha(0.15), "white") }) : null;
      }
      return vars;
    };
  }, [isAlive(item) && item.getOneColor()]);
  if (!isAlive(item)) return null;

  const as = getRoot(item).annotationStore;
  const anno = as.selectedHistory ?? as.selected;
  const classnames = [
    styles.lstitem,
    flat && styles.flat,
    item.hidden === true && styles.hidden,
    item.selected && styles.selected,
  ].filter(Boolean);

  const vars = getVars();
  return (
    <List.Item
      key={item.id}
      className={classnames.join(" ")}
      onClick={() => anno.selectArea(item)}
      onMouseOver={() => item.setHighlight(true)}
      onMouseOut={() => item.setHighlight(false)}
      style={vars}
    >
      <RegionItemContent idx={idx} item={item}/>
    </List.Item>
  );
});
