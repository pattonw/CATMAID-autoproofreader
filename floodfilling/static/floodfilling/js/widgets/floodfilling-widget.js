/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var FloodfillingWidget = function() {
    this.widgetID = this.registerInstance();
    this.idPrefix = `floodfilling-widget${this.widgetID}-`;

    this.oTable = null;
  };

  $.extend(FloodfillingWidget.prototype, new InstanceRegistry());

  FloodfillingWidget.prototype.getName = function() {
    return 'Floodfilling Widget ' + this.widgetID;
  };

  FloodfillingWidget.prototype.getWidgetConfiguration = function() {
    const self = this;
    const tableID = this.idPrefix + 'datatable';
    return {
      helpText: 'Floodfilling Widget: ',
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        const button = document.createElement('label');
        button.title = 'test button';
        button.id = self.idPrefix + 'button';
        controls.append(button);

        const add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("value", "Add");
        add.onclick = function() {
          self.getSomeData();
        };
        button.appendChild(add);
      },
      contentID: this.idPrefix + 'content',
      createContent: function(container) {
        container.innerHTML = `
        <table cellpadding="0" cellspacing="0" border="0" class="display" id="${tableID}">
          <thead>
            <tr>
              <th>Creator ID
                <input type="number" name="searchCreatorId" id="${self.idPrefix}search-creator-id"
                  value="0" class="search_init"/></th>
              <th>Node ID
                <input type="number" name="searchNodeId" id="${self.idPrefix}search-node-id"
                  value="0" class="search_init"/>
              </th>
              <th>Skeleton ID
                <input type="number" name="searchSkeletonId" id="${self.idPrefix}search-skeleton-id"
                  value="0" class="search_init"/>
              </th>
              </tr>
          </thead>
          <tfoot>
            <tr>
              <th>Creator ID</th>
              <th>Node ID</th>
              <th>skeleton ID</th>
            </tr>
          </tfoot>
          <tbody>
          </tbody>
        </table>`;
      },
      init: self.init.bind(self)
    };
  };

  FloodfillingWidget.prototype.init = function() {
    const self = this;
    console.log("initialized");
    const tableID = this.idPrefix + 'datatable';
    const $table = $('#' + tableID);

    this.oTable = $table.DataTable({
      // http://www.datatables.net/usage/options
      destroy: true,
      dom: '<"H"lrp>t<"F"ip>',
      serverSide: false,
      paging: true,
      lengthChange: true,
      autoWidth: false,
      pageLength: CATMAID.pageLengthOptions[0],
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      jQueryUI: true,
      processing: true,
      deferRender: true,
      columns: [
        {
          data: 'creatorID',
          render: Math.floor,
          orderable: true,
          searchable: true,
          className: "center"
        },
        {
          data: 'nodeID',
          render: Math.floor,
          orderable: true,
          searchable: true,
          className: "center"
        },
        {
          data: 'skeletonID',
          render: Math.floor,
          orderable: true,
          searchable: true,
          className: "center"
        }
      ]
    });

    const exactNumSearch = function(event) {
      if (event.which == 13) {
        event.stopPropagation();
        event.preventDefault();
        // Filter with a regular expression
        const filterValue = event.currentTarget.value;
        const regex = filterValue === '' ? '' : `^${filterValue}$`;

        self.oTable
          .column(event.currentTarget.closest('th'))
          .search(regex, true, false)
          .draw();
      }
    };

    $(`#${self.idPrefix}search-creator-id`).keydown(exactNumSearch);
    $(`#${self.idPrefix}search-node-id`).keydown(exactNumSearch);
    $(`#${self.idPrefix}search-skeleton-id`).keydown(exactNumSearch);

    const $headerInput = $table.find('thead input');

    // prevent sorting the column when focusing on the search field
    $headerInput.click(function (event) {
      event.stopPropagation();
    });

    // remove the 'Search' string when first focusing the search box
    $headerInput.focus(function () {
      if (this.className === "search_init") {
        this.className = "";
        this.value = "";
      }
    });

  };

  FloodfillingWidget.prototype.update = function(){
    console.log("update");
  }

  FloodfillingWidget.prototype.destroy = function() {
    this.unregisterInstance();
  };

  FloodfillingWidget.prototype.getSomeData = function(){
    console.log("getting some data");
    const self = this;
    self.oTable.clear();
    return CATMAID.fetch(`${project.id}/nodes/`, 'POST', {
      limit : 2,
      left : 0,
      top : 0,
      z1 : 0,
      right : 10000,
      bottom : 10000,
      z2 : 1
    })
      .then(function(response) {
        let nodes = response[0];
        for (let node of nodes){
          let row = {creatorID:node[9],nodeID:node[0],skeletonID:node[7],parentId:node[1]};
          self.oTable.rows.add([row]);
        }
        self.oTable.draw();
      })
      .catch(function(error){
        console.log(error);
      });
  }

  CATMAID.registerWidget({
    name: 'floodfilling Widget',
    description: 'Widget associated with the floodfilling app',
    key: 'floodfilling-widget',
    creator: FloodfillingWidget
  });

})(CATMAID);
