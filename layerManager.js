export function setupLayerListWidget(LayerList, Expand, view) {
  const layerList = new LayerList({
    view: view,
    listItemCreatedFunction: function (event) {
      const item = event.item;
      item.panel = {
        content: "legend",
        open: false,
      };
    },
  });
  const expandWidget = new Expand({
    view: view,
    content: layerList,
    expandIcon: "layers",
    expanded: false,
    expandTooltip: "قائمة الطبقات",
  });

  view.ui.add(expandWidget, "top-right");
}
