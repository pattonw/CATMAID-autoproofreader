/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var FloodfillingWidget = function() {
    this.widgetID = this.registerInstance();
    this.idPrefix = `floodfilling-widget${this.widgetID}-`;

    this.oTable = null;

    this.skeletons = [];

  };

  FloodfillingWidget.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  FloodfillingWidget.prototype.constructor = FloodfillingWidget;

  $.extend(FloodfillingWidget.prototype, new InstanceRegistry());

  FloodfillingWidget.prototype.getName = function() {
    return 'Floodfilling Widget ' + this.widgetID;
  };

  FloodfillingWidget.prototype.getWidgetConfiguration = function() {
    const tableID = this.idPrefix + 'datatable';
    return {
      helpText: 'Floodfilling Widget: ',
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        
				var tabs = CATMAID.DOM.addTabGroup(controls, this.widgetID, ['Server','Validate', 'Explore']);

        let address = document.createElement('input');
        address.setAttribute("id","server-address")
        address.addEventListener("keydown", function(event){
          if (event.which === 13){
            console.log(address.value);
          }
        });

        var fileButton = CATMAID.DOM.createFileButton(
          'st-file-dialog-' + this.widgetID, true, function(evt) {
            self.loadConfigFromJSON(evt.target.files);
          });
        var open = document.createElement('input');
        open.setAttribute("type", "button");
        open.setAttribute("value", "Open Config JSON");
        open.onclick = function() { fileButton.click(); };

      
        CATMAID.DOM.appendToTab(tabs['Server'],
						[[open],
            ]);

				CATMAID.DOM.appendToTab(tabs['Validate'],
						[[document.createTextNode('From')],
						 [CATMAID.skeletonListSources.createSelect(this)],
						 ['Append', this.loadSource.bind(this)],
						 ['Clear', this.clear.bind(this)],
						 ['Run', this.run.bind(this)],
						]);

				CATMAID.DOM.appendToTab(tabs['Explore'],
						[[document.createTextNode('From')],
              [CATMAID.skeletonListSources.createSelect(this)],
              ['Append', this.loadSource.bind(this)],
              ['Clear', this.clear.bind(this)],
              ['Run', this.run.bind(this)],
            ]);
				$(controls).tabs();
      },
      contentID: this.idPrefix + 'content',
      createContent: function(container) {
        container.innerHTML = `
        <table cellpadding="0" cellspacing="0" border="0" class="display" id="${tableID}">
          <thead>
            <tr>
              <th>Skeleton ID
                <input type="number" name="searchSkeletonId" id="${this.idPrefix}search-skeleton-id"
                  value="0" class="search_init"/></th>
              <th>Skeleton Size
                <input type="number" name="searchSkeletonSize" id="${this.idPrefix}search-skeleton-size"
                  value="0" class="search_init"/>
              </th>
            </tr>
          </thead>
          <tfoot>
            <tr>
              <th>skeleton ID</th>
              <th>skeleton Size</th>
            </tr>
          </tfoot>
          <tbody>
          </tbody>
        </table>`;
      },
      init: this.init.bind(this)
    };
  };

  FloodfillingWidget.prototype.append = function(models) {
    let skids = Object.keys(models);
    this.appendOrdered(skids, models);
  };

  FloodfillingWidget.prototype.appendOrdered = function(skids, models) {
    CATMAID.NeuronNameService.getInstance().registerAll(this, models, (function() {
      fetchSkeletons(
          skids,
          function(skid) { return CATMAID.makeURL(project.id + '/skeletons/' + skid + '/compact-detail'); },
          function(skid) { return {}; },
          this.appendOne.bind(this),
          function(skid) { CATMAID.msg("ERROR", "Failed to load skeleton #" + skid); },
          this.update.bind(this),
          "GET");
    }).bind(this));
  };

  FloodfillingWidget.prototype.appendOne = function(skid, json){
    let row = {skeletonID:skid,skeletonSize:json[0].length,skeletonTree:json[0]};
    this.oTable.rows.add([row]);
  };


  FloodfillingWidget.prototype.clear = function() {
    this.oTable.clear();
    this.oTable.draw();
  };


  FloodfillingWidget.prototype.init = function() {
    const self = this;
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
          data: 'skeletonID',
          render: Math.floor,
          orderable: true,
          searchable: true,
          className: "skeletonID"
        },
        {
          data: 'skeletonSize',
          render: Math.floor,
          orderable: true,
          searchable: true,
          className: "skeletonSize"
        }
      ]
    });

    $(`#${tableID} tbody`).on( 'click', 'tr', function () {
      if ( $(this).hasClass('selected') ) {
          $(this).removeClass('selected');
      }
      else {
          self.oTable.$('tr.selected').removeClass('selected');
          $(this).addClass('selected');
      }
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

    $(`#${self.idPrefix}search-skeleton-id`).keydown(exactNumSearch);
    $(`#${self.idPrefix}search-skeleton-size`).keydown(exactNumSearch);

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
    this.oTable.draw();
    console.log("update");
  }

  FloodfillingWidget.prototype.run = function(){
    console.log(this.oTable.row('.selected').data());
  }

  FloodfillingWidget.prototype.destroy = function() {
    this.unregisterInstance();
		this.unregisterSource();
  };

  CATMAID.FloodfillingWidget = FloodfillingWidget;

  CATMAID.registerWidget({
    name: 'floodfilling Widget',
    description: 'Widget associated with the floodfilling app',
    key: 'floodfilling-widget',
    creator: FloodfillingWidget
  });

})(CATMAID);
