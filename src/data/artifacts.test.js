import assert from "node:assert/strict";
import test from "node:test";
import { artifacts, categories, artifactMap } from "./artifacts.js";

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

test("artifact catalog: ids/categories/tours/hotspots are consistent", () => {
  assert.ok(Array.isArray(categories), "categories should be an array");
  assert.ok(Array.isArray(artifacts), "artifacts should be an array");
  assert.ok(artifacts.length > 0, "artifacts should not be empty");

  const categoryIds = new Set();
  for (const category of categories) {
    assert.ok(category && typeof category.id === "string" && category.id.trim(), "category id required");
    assert.ok(typeof category.label === "string" && category.label.trim(), "category label required");
    assert.equal(categoryIds.has(category.id), false, `duplicate category id: ${category.id}`);
    categoryIds.add(category.id);
  }
  assert.ok(categoryIds.has("all"), "categories should include all");

  const artifactIds = new Set();
  for (const artifact of artifacts) {
    assert.ok(artifact && typeof artifact.id === "string" && artifact.id.trim(), "artifact id required");
    assert.equal(artifactIds.has(artifact.id), false, `duplicate artifact id: ${artifact.id}`);
    artifactIds.add(artifact.id);

    assert.ok(typeof artifact.title === "string" && artifact.title.trim(), `artifact ${artifact.id} title required`);
    assert.ok(typeof artifact.hook === "string" && artifact.hook.trim(), `artifact ${artifact.id} hook required`);
    assert.ok(typeof artifact.category === "string" && artifact.category.trim(), `artifact ${artifact.id} category required`);
    assert.ok(categoryIds.has(artifact.category), `artifact ${artifact.id} has unknown category: ${artifact.category}`);

    assert.ok(typeof artifact.modelUrl === "string" && artifact.modelUrl.startsWith("/models/"), `artifact ${artifact.id} modelUrl must start with /models/`);

    if (Object.prototype.hasOwnProperty.call(artifact, "releaseYear")) {
      assert.ok(
        artifact.releaseYear === null || isFiniteNumber(artifact.releaseYear),
        `artifact ${artifact.id} releaseYear must be number or null`
      );
    }

    if (Object.prototype.hasOwnProperty.call(artifact, "featuredRank")) {
      assert.ok(
        artifact.featuredRank === null || isFiniteNumber(artifact.featuredRank),
        `artifact ${artifact.id} featuredRank must be number or null`
      );
    }

    assert.ok(artifact.story && typeof artifact.story === "object", `artifact ${artifact.id} story required`);
    assert.ok(typeof artifact.story.title === "string", `artifact ${artifact.id} story.title must be string`);
    assert.ok(typeof artifact.story.summary === "string", `artifact ${artifact.id} story.summary must be string`);
    assert.ok(Array.isArray(artifact.story.body), `artifact ${artifact.id} story.body must be array`);
    assert.ok(artifact.story.body.every((entry) => typeof entry === "string"), `artifact ${artifact.id} story.body must be strings`);

    if (Array.isArray(artifact.story.references)) {
      for (const ref of artifact.story.references) {
        assert.ok(ref && typeof ref.label === "string", `artifact ${artifact.id} story reference label must be string`);
        assert.ok(ref && typeof ref.url === "string", `artifact ${artifact.id} story reference url must be string`);
        assert.ok(/^https?:\/\//.test(ref.url), `artifact ${artifact.id} story reference url must be http(s): ${ref.url}`);
      }
    }

    const hotspotIds = new Set();
    assert.ok(Array.isArray(artifact.hotspots), `artifact ${artifact.id} hotspots must be array`);
    for (const hotspot of artifact.hotspots) {
      assert.ok(hotspot && typeof hotspot.id === "string" && hotspot.id.trim(), `artifact ${artifact.id} hotspot id required`);
      assert.equal(hotspotIds.has(hotspot.id), false, `artifact ${artifact.id} duplicate hotspot id: ${hotspot.id}`);
      hotspotIds.add(hotspot.id);

      assert.ok(typeof hotspot.label === "string" && hotspot.label.trim(), `artifact ${artifact.id} hotspot ${hotspot.id} label required`);
      assert.ok(typeof hotspot.title === "string" && hotspot.title.trim(), `artifact ${artifact.id} hotspot ${hotspot.id} title required`);
      assert.ok(typeof hotspot.body === "string" && hotspot.body.trim(), `artifact ${artifact.id} hotspot ${hotspot.id} body required`);

      assert.ok(Array.isArray(hotspot.norm) && hotspot.norm.length === 3, `artifact ${artifact.id} hotspot ${hotspot.id} norm must be [x,y,z]`);
      assert.ok(hotspot.norm.every(isFiniteNumber), `artifact ${artifact.id} hotspot ${hotspot.id} norm must be finite numbers`);

      if (hotspot.focus && typeof hotspot.focus === "object") {
        const { theta, phi, radius } = hotspot.focus;
        if (theta !== undefined) assert.ok(isFiniteNumber(theta), `artifact ${artifact.id} hotspot ${hotspot.id} focus.theta must be number`);
        if (phi !== undefined) assert.ok(isFiniteNumber(phi), `artifact ${artifact.id} hotspot ${hotspot.id} focus.phi must be number`);
        if (radius !== undefined) assert.ok(isFiniteNumber(radius), `artifact ${artifact.id} hotspot ${hotspot.id} focus.radius must be number`);
      }

      if (hotspot.reference !== undefined) {
        assert.ok(typeof hotspot.reference === "string", `artifact ${artifact.id} hotspot ${hotspot.id} reference must be string`);
        assert.ok(/^https?:\/\//.test(hotspot.reference), `artifact ${artifact.id} hotspot ${hotspot.id} reference must be http(s): ${hotspot.reference}`);
      }
    }

    assert.ok(Array.isArray(artifact.tour), `artifact ${artifact.id} tour must be array`);
    for (const step of artifact.tour) {
      assert.ok(step && typeof step.hotspotId === "string" && step.hotspotId.trim(), `artifact ${artifact.id} tour step hotspotId required`);
      assert.ok(hotspotIds.has(step.hotspotId), `artifact ${artifact.id} tour references missing hotspotId: ${step.hotspotId}`);
      assert.ok(typeof step.caption === "string", `artifact ${artifact.id} tour caption must be string`);
    }
  }

  for (const id of artifactIds) {
    assert.equal(artifactMap.has(id), true, `artifactMap missing id: ${id}`);
    assert.equal(artifactMap.get(id)?.id, id, `artifactMap value mismatch for id: ${id}`);
  }
});

