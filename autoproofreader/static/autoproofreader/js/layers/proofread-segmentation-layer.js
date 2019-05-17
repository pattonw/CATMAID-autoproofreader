/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/*
let fsv = project.focusedStackViewer;
let fs = new CATMAID.Stack('no-id', 'Some title', [53952, 155648, 7063], {x: 4, y: 4, z: 40}, {x: 0, y: 0, z: 0}, [], [{x: 1, y: 1, z: 1}, {x: 2, y: 2, z: 1}, {x: 4, y: 4, z: 1}, {x: 8, y: 8, z: 1}, {x: 16, y: 16, z: 1}, {x: 32, y: 32, z: 1}, {x: 64, y: 64, z: 1}, {x: 128, y: 128, z: 1}, {x: 256, y: 256, z: 1}], -2, '', '', '', 0, {x: 0, y: 0, z: 0}, [0,0,0], [{id: 'no-mirror-id', tile_source_type: 5, image_base: 'https://bocklab.hhmi.org/tiles/special/fafb_v14_align_tps_jpg85/', file_extension: 'jpg', tile_width: 1024,tile_height: 1024, title: 'Test Title'}]);
let layer = new CATMAID.PixiTileLayer(fsv, 'Test title', fs, 0, true, 1, false, "nearest", true);
fsv.addStackLayer(fs, layer);

*/

(function(CATMAID) {
  "use strict";
  /**
   * This layer can project a complete skeleton into own tracing layer.
   */
  class ProofreadSegmentationLayer extends CATMAID.PixiImageBlockLayer {
    constructor(options, ...args) {
      super(...args);

      // the result to visualize
      this.currentResult = null;
      // retrieve initial result from options
      var initialSource =
        options && options.result_id ? options.result_id : undefined;
      if (initialSource) {
        this.replaceResult(initialSource);
      } else {
        throw CATMAID.Error("No result chosen for visualization!");
      }

      this.resize(this.stackViewer.viewWidth, this.stackViewer.viewHeight);
    }

    /**
     * The set of options and defaults.
     */
    options = {
      result_id: null
    };

    /**
     * Update default options
     */
    updateDefaultOptions(options) {
      CATMAID.mergeOptions(
        ProofreadSegmentationLayer.options,
        options || {},
        ProofreadSegmentationLayer.options,
        true
      );
    }

    /**
     * Update options of this layer, giving preference to option fields in the
     * passed in object. If a known object key isn't available, the default can
     * optionally be set.
     */
    updateOptions(options, setDefaults) {
      CATMAID.mergeOptions(
        this.options,
        options || {},
        ProofreadSegmentationLayer.options,
        setDefaults
      );
    }

    /* Shouldn't have to keep remaking the layer. Instead just switch stacks.
            For this to be possible stack creation has to be moved into layer logic

         Returns a stack for displaying the segmentations corresponding
         the the currently selected result.
        
        getStack() {
            return this.getStackAttrs().then((attrs) => {
                return;

            })
        }

        getStackAttrs() {
            let self = this;
            return CATMAID.fetch("ext/autoproofreader/" + project.id + "/autoproofreader-results", "GET", { result_id: self.currentResult }).then((result) => {
                console.log(result);
                return CATMAID.fetch("ext/autoproofreader/" + project.id + "/autoproofreader-results", "GET", { result_id: self.currentResult, uuid: true }).then((uuid) => {
                    console.log(uuid);
                    return CATMAID.fetch("files/proofreading_segmentations/" + uuid + "/segmentations.n5/segmentation_counts/attributes.json", "GET").then((attrs_file) => {
                        let attrs = {
                            dimensions: attrs_file.dimensions,
                            resolution: { x: 40, y: 40, z: 40 },
                            tile_width: attrs_file.blockSize[0],
                            tile_height: attrs_file.blockSize[1],
                            tile_source_type: 11,
                            image_base: "files/proofreading_segmentations/" + uuid + "/segmentations.n5/segmentation_counts/0_1_2"
                        };
                        return attrs
                    })
                })
            })
        }
        */

    /**
     * Replace the current subsciption with a new one to the given source.
     *
     * @param {Object} source The source to subscribe to now
     */
    replaceResult(result_id) {
      if (result_id) {
        this.currentResult = result_id;
      } else {
        throw Error("visualization layer must have a result to visualize");
      }
    }

    /* Iterface methods */

    getLayerName() {
      return "proofread segmentation layer";
    }
  }

  // Make layer available in CATMAID namespace
  CATMAID.ProofreadSegmentationLayer = ProofreadSegmentationLayer;
})(CATMAID);
