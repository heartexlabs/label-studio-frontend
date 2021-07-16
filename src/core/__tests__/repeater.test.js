/* global it, expect */
import Tree from "../Tree";

function createStore(utterances) {
  return { task : { dataObj : { utterances }} };
}

it("Should repeat blocks based on store key", () => {
  const result = Tree.treeToModel(`
     <View>
        <Repeater on="$utterances">
          <Text name="user_{{idx}}" value="$utterances[{{idx}}].text" />
        </Repeater>
     </View>
  `,  createStore(["hello", "world"]));

  expect(result.children).toHaveLength(2);
});

it("Should have 0 children when wrong or invalid key is passed", () => {
  const result = Tree.treeToModel(`
     <View>
        <Repeater on="$otherKey">
          <Text name="user_{{idx}}" value="$utterances[{{idx}}].text" />
        </Repeater>
     </View>
  `,  createStore(["hello", "world"]));


  expect(result.children).toBe(null);
});

it("Should replace child three {{idx}} with current itteration of index", () => {
  const result = Tree.treeToModel(`
     <View>
        <Repeater on="$utterances">
          <Text name="user_{{idx}}" value="$utterances[{{idx}}].text" />
        </Repeater>
     </View>
  `,  createStore(["hello", "world"]));

  const textTag1 = result.children[0].children[0];
  const textTag2 = result.children[1].children[0];

  expect(textTag1.name).toBe("user_0");
  expect(textTag2.name).toBe("user_1");

  expect(textTag1.value).toBe("$utterances[0].text");
  expect(textTag2.value).toBe("$utterances[1].text");
});

it("Should support custom index flags", () => {
  const result = Tree.treeToModel(`
     <View>
        <Repeater on="$utterances" indexFlag="{{Customidx}}">
          <Text name="user_{{Customidx}}" value="$utterances[{{Customidx}}].text" />
        </Repeater>
     </View>
  `,  createStore(["hello", "world"]));

  const textTag = result.children[0].children[0];

  expect(textTag.name).toBe("user_0");
  expect(textTag.value).toBe("$utterances[0].text");
});

