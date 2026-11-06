import assert from "node:assert/strict";
import { convertHtml } from "../server/services/html-converter.js";

const html = `<!doctype html>
<html>
<body>
  <style>
    :root { --brand: #2563eb; }
    body { color: #334155; font-family: Arial, sans-serif; }
    .hero {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 40px;
      max-width: 1200px;
      margin: 0 auto;
      padding: 80px 24px;
      background: var(--brand);
    }
    .hero h1 { font-size: 48px; line-height: 1.15; color: #fff; }
    .hero p { margin: 0 0 16px; color: #fff; }
    .hero a.btn {
      display: inline-block;
      padding: 12px 24px;
      border-radius: 8px;
      background: #fff;
      color: var(--brand);
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }
    @media (max-width: 1024px) {
      .cards { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 767px) {
      .hero { flex-direction: column; padding: 40px 16px; }
      .hero h1 { font-size: 32px; }
    }
  </style>
  <section class="hero">
    <div>
      <h1>Hello <span style="color:#facc15">Elementor</span></h1>
      <p>Rich <a href="/more">text</a> and <strong>bold</strong>.</p>
      <a class="btn" href="/start">Start</a>
    </div>
    <img src="images/hero.png" alt="Hero" />
  </section>
  <div class="cards">
    <article><h2>One</h2></article>
    <article><h2>Two</h2></article>
    <article><h2>Three</h2></article>
  </div>
  <ul><li>One<li>Two</ul>
  <form><input name="email" placeholder="Email"><a href="javascript:alert(1)">bad</a></form>
  <div class="state">Desktop only</div>
  <a class="plain-link" href="/plain">Plain link</a>
  <script>alert("xss")</script>
</body>
</html>`;

const { template, stats } = convertHtml(html, {
  title: "Test",
  baseUrl: "https://example.com/site/page/",
});

assert.equal(template.title, "Test");
assert.ok(template.content.length >= 2);
assert.equal(stats.source, "html");

const hero = template.content[0];
assert.equal(hero.settings.container_type, "flex");
assert.equal(hero.settings.flex_justify_content, "space-between");
assert.equal(hero.settings.flex_align_items, "center");
assert.equal(hero.settings.content_width, "boxed");
assert.equal(hero.settings.boxed_width.size, 1200);
assert.equal(hero.settings.background_color, "#2563eb");
assert.equal(hero.settings.padding.top, "80");
assert.equal(hero.settings.flex_direction_mobile, "column");
assert.equal(hero.settings.padding_mobile.top, "40");
assert.equal(hero.isInner, false);

const heroCopy = hero.elements.find((n) => n.elType === "container");
assert.ok(heroCopy, "hero copy container");
assert.equal(heroCopy.isInner, true);
const heading = heroCopy.elements.find((n) => n.widgetType === "heading");
assert.equal(heading.settings.typography_font_size.size, 48);
assert.equal(heading.settings.typography_font_size_mobile.size, 32);
assert.equal(heading.settings.title, "Hello Elementor");

const paragraph = heroCopy.elements.find((n) => n.widgetType === "text-editor");
assert.match(paragraph.settings.editor, /<a href="https:\/\/example\.com\/more">text<\/a>/);
assert.match(paragraph.settings.editor, /<strong>bold<\/strong>/);
assert.equal(paragraph.settings.typography_font_family, "Arial");
assert.equal(paragraph.settings.text_color, "#fff");
assert.equal(paragraph.settings._margin.bottom, "16");

const image = hero.elements.find((n) => n.widgetType === "image");
assert.equal(image.settings.image.url, "https://example.com/site/page/images/hero.png");
assert.equal(image.settings.image_alt, "Hero");

const cards = template.content.find((n) => n.settings?.container_type === "grid");
assert.ok(cards, "grid container");
assert.match(cards.settings.grid_columns_grid.size, /repeat\(3/);
assert.equal(cards.settings.grid_gaps.row, "24");
assert.match(cards.settings.grid_columns_grid_tablet.size, /repeat\(2/);

const htmlWidgets = [];
(function walk(nodes) {
  for (const node of nodes || []) {
    if (node.widgetType === "html") htmlWidgets.push(node.settings.html);
    walk(node.elements);
  }
})(template.content);
assert.ok(htmlWidgets.some((x) => x.includes("<ul")));
assert.ok(htmlWidgets.some((x) => x.includes("<form")));
assert.ok(htmlWidgets.every((x) => !x.includes("<script")));
assert.ok(htmlWidgets.every((x) => !/javascript:/i.test(x)));

assert.equal(stats.images, 1);
assert.ok(stats.widgets.heading >= 4);

const edge = convertHtml(`<style>
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .item:not(.featured) { width: 25%; flex: 1 0 auto; }
  .item:nth-child(2) { padding: 10px !important; }
  .state { display: none; }
  @media (max-width: 767px) { .state { display: block; } .item { width: 100%; } }
</style>
<div class="grid">
  <div class="item"><a href="/plain">Plain link</a></div>
  <div class="item featured">B</div>
  <div class="state">Desktop only</div>
</div>`, { baseUrl: "https://example.com/" }).template;

const edgeGrid = edge.content[0];
const edgeItems = edgeGrid.elements;
assert.equal(edgeItems[0].settings.width.unit, "custom");
assert.equal(edgeItems[0].settings.width.size, "25%");
assert.equal(edgeItems[0].settings._flex_size, "grow");
assert.equal(edgeItems[0].elType, "container");
const plainLink = edgeItems[0].elements[0];
assert.equal(plainLink.widgetType, "text-editor");
assert.match(plainLink.settings.editor, /href="https:\/\/example\.com\/plain"/);
assert.equal(edgeItems[1].settings.width, undefined);
assert.equal(edgeItems[1].settings.padding.top, "10");
const state = edge.content.find((n) => n.elements?.some((c) => c.settings?.hide_desktop));
assert.ok(state, "desktop-hidden node remains for mobile visibility");
assert.equal(state.elements[0].settings.hide_mobile, undefined);

console.log("html-converter: ok");
