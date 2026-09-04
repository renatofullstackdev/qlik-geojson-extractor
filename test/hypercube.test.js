import test from "node:test";
import assert from "node:assert/strict";
import { buildPointCubeDefinition, fetchAllStraightCubeRows } from "../src/hypercube.js";

test("buildPointCubeDefinition reproduces fields, custom properties and coordinate expressions", () => {
  const result = buildPointCubeDefinition({
    entityKey: "ENTITY",
    latitudeField: "LAT",
    longitudeExpression: "Avg([LON])",
    properties: ["NAME", { label: "SECTORS", expression: "Concat(Distinct [SECTOR], ', ')" }],
    measures: [{ label: "COUNT", expression: "Count(ID)" }]
  });
  const dimension = result.definition.qHyperCubeDef.qDimensions[0];
  assert.deepEqual(dimension.qDef.qFieldDefs, ["ENTITY"]);
  assert.equal(dimension.qAttributeExpressions[0].qExpression, "Only([NAME])");
  assert.equal(dimension.qAttributeExpressions[1].qExpression, "Concat(Distinct [SECTOR], ', ')");
  assert.equal(dimension.qAttributeExpressions[2].qExpression, "Only([LAT])");
  assert.equal(dimension.qAttributeExpressions[3].qExpression, "Avg([LON])");
  assert.equal(result.definition.qHyperCubeDef.qMeasures[0].qDef.qDef, "Count(ID)");
});

test("fetchAllStraightCubeRows paginates without gaps or duplicates", async () => {
  const calls = [];
  const client = {
    async rpc(handle, method, params) {
      assert.equal(method, "GetHyperCubeData");
      const page = params[1][0];
      calls.push(page);
      return { qDataPages: [{ qMatrix: Array.from({ length: page.qHeight }, (_, i) => [`row-${page.qTop + i}`]) }] };
    }
  };
  const rows = await fetchAllStraightCubeRows(client, 5, { qSize: { qcy: 10, qcx: 3 } }, { maxCellsPerPage: 9 });
  assert.deepEqual(calls.map(({ qTop, qHeight }) => [qTop, qHeight]), [[0,3],[3,3],[6,3],[9,1]]);
  assert.deepEqual(rows.flat(), Array.from({ length: 10 }, (_, i) => `row-${i}`));
});
