import {
  addClass,
  fastInnerText,
  removeClass,
} from '../../../helpers/dom/element';
import { objectEach } from '../../../helpers/object';
import { randomString } from '../../../helpers/string';
import Event from './event';
import Overlays from './overlays';
import Scroll from './scroll';
import Settings from './settings';
import MasterTable from './table/master';
import Viewport from './viewport';

// todo refactoring (IMPORTANT): introduce facade pattern to keep backward compatibility
/**
 * @class Walkontable
 */
export default class Walkontable {
  /**
   * The walkontable instance id.
   *
   * @public
   * @type {Readonly<string>}
   */
  guid = `wt_${randomString()}`;

  /**
   * The DOM bindings.
   *
   * @public
   */
  domBindings;

  /**
   * Settings.
   *
   * @public
   * @type {Settings}
   */
  wtSettings;
  
  /**
   * @param {HTMLTableElement} table Main table.
   * @param {SettingsPure|Settings} settings The Walkontable settings.
   * @param {?{selections: *, overlay: Overlay, viewport: (Viewport|*), source: Walkontable, event: Event}} clone clone data. @todo extract type
   */
  constructor(table, settings, clone=undefined) {
    const originalHeaders = [];

    this.domBindings = {
      rootTable: table,
      rootDocument: table.ownerDocument,
      rootWindow: table.ownerDocument.defaultView,
    }

    this.wtSettings = settings instanceof Settings ? settings : new Settings(settings);
    const facadeInjector = this.wtSettings.getSettingPure('facadeInjector'); // todo refactoring ioc.
    // bootstrap from settings
    if (clone) { // todo refactoring extract to another class, maybe with same base class
      this.cloneSource = clone.source;
      this.cloneOverlay = clone.overlay;
      this.wtTable = this.cloneOverlay.createTable(this, this.domBindings.rootTable , this.wtSettings, this.domBindings);
      this.wtScroll = new Scroll(this.createScrollDao()); // todo refactoring: consider about IOC: it requires wtSettings, topOverlay, leftOverlay, wtTable, wtViewport, rootWindow
      this.wtViewport = clone.viewport;
      this.wtEvent = new Event(this, this.domBindings, facadeInjector);
      this.selections = clone.selections;
    } else {
      this.wtTable = new MasterTable(this, this.domBindings.rootTable, this.wtSettings, this.domBindings); //todo refactoring remove passing this into Table - potentially breaks many things. 
      this.wtScroll = new Scroll(this.createScrollDao()); // todo refactoring: consider about IOC: it requires wtSettings, topOverlay, leftOverlay, wtTable, wtViewport, rootWindow
      this.wtViewport = new Viewport(this, this.domBindings);
      this.wtEvent = new Event(this, this.domBindings, facadeInjector);
      this.selections = this.wtSettings.getSetting('selections');
      this.wtOverlays = new Overlays(this, this.wtSettings, this.domBindings);
      this.exportSettingsAsClassNames();
    }

    // find original headers
    if (this.wtTable.THEAD.childNodes.length && this.wtTable.THEAD.childNodes[0].childNodes.length) {
      for (let c = 0, clen = this.wtTable.THEAD.childNodes[0].childNodes.length; c < clen; c++) {
        originalHeaders.push(this.wtTable.THEAD.childNodes[0].childNodes[c].innerHTML);
      }
      if (!this.wtSettings.getSetting('columnHeaders').length) {
        this.wtSettings.update('columnHeaders', [
          function(column, TH) {
            fastInnerText(TH, originalHeaders[column]);
          }
        ]);
      }
    }
    this.drawn = false;
    this.drawInterrupted = false;
  }

  /**
   * Force rerender of Walkontable.
   *
   * @param {boolean} [fastDraw=false] When `true`, try to refresh only the positions of borders without rerendering
   *                                   the data. It will only work if Table.draw() does not force
   *                                   rendering anyway.
   * @returns {Walkontable}
   */
  draw(fastDraw = false) {
    this.drawInterrupted = false;

    if (!fastDraw && !this.wtTable.isVisible()) {
      // draw interrupted because TABLE is not visible
      this.drawInterrupted = true;
    } else {
      this.wtTable.draw(fastDraw);
    }

    return this;
  }

  /**
   * Returns the TD at coords. If topmost is set to true, returns TD from the topmost overlay layer,
   * if not set or set to false, returns TD from the master table.
   *
   * @param {CellCoords} coords The cell coordinates.
   * @param {boolean} [topmost=false] If set to `true`, it returns the TD element from the topmost overlay. For example,
   *                                  if the wanted cell is in the range of fixed rows, it will return a TD element
   *                                  from the top overlay.
   * @returns {HTMLElement}
   */
  getCell(coords, topmost = false) {
    if (!topmost) {
      return this.wtTable.getCell(coords);
    }

    const totalRows = this.wtSettings.getSetting('totalRows');
    const fixedRowsTop = this.wtSettings.getSetting('fixedRowsTop');
    const fixedRowsBottom = this.wtSettings.getSetting('fixedRowsBottom');
    const fixedColumns = this.wtSettings.getSetting('fixedColumnsLeft');

    if (coords.row < fixedRowsTop && coords.col < fixedColumns) {
      return this.wtOverlays.topLeftCornerOverlay.clone.wtTable.getCell(coords);

    } else if (coords.row < fixedRowsTop) {
      return this.wtOverlays.topOverlay.clone.wtTable.getCell(coords);

    } else if (coords.col < fixedColumns && coords.row >= totalRows - fixedRowsBottom) {
      if (this.wtOverlays.bottomLeftCornerOverlay && this.wtOverlays.bottomLeftCornerOverlay.clone) {
        return this.wtOverlays.bottomLeftCornerOverlay.clone.wtTable.getCell(coords);
      }

    } else if (coords.col < fixedColumns) {
      return this.wtOverlays.leftOverlay.clone.wtTable.getCell(coords);

    } else if (coords.row < totalRows && coords.row >= totalRows - fixedRowsBottom) {
      if (this.wtOverlays.bottomOverlay && this.wtOverlays.bottomOverlay.clone) {
        return this.wtOverlays.bottomOverlay.clone.wtTable.getCell(coords);
      }

    }

    return this.wtTable.getCell(coords);
  }

  /**
   * Scrolls the viewport to a cell (rerenders if needed).
   *
   * @param {CellCoords} coords The cell coordinates to scroll to.
   * @param {boolean} [snapToTop] If `true`, viewport is scrolled to show the cell on the top of the table.
   * @param {boolean} [snapToRight] If `true`, viewport is scrolled to show the cell on the right of the table.
   * @param {boolean} [snapToBottom] If `true`, viewport is scrolled to show the cell on the bottom of the table.
   * @param {boolean} [snapToLeft] If `true`, viewport is scrolled to show the cell on the left of the table.
   * @returns {boolean}
   */
  scrollViewport(coords, snapToTop, snapToRight, snapToBottom, snapToLeft) {
    if (coords.col < 0 || coords.row < 0) {
      return false;
    }

    return this.wtScroll.scrollViewport(coords, snapToTop, snapToRight, snapToBottom, snapToLeft);
  }

  /**
   * Scrolls the viewport to a column (rerenders if needed).
   *
   * @param {number} column Visual column index.
   * @param {boolean} [snapToRight] If `true`, viewport is scrolled to show the cell on the right of the table.
   * @param {boolean} [snapToLeft] If `true`, viewport is scrolled to show the cell on the left of the table.
   * @returns {boolean}
   */
  scrollViewportHorizontally(column, snapToRight, snapToLeft) {
    if (column < 0) {
      return false;
    }

    return this.wtScroll.scrollViewportHorizontally(column, snapToRight, snapToLeft);
  }

  /**
   * Scrolls the viewport to a row (rerenders if needed).
   *
   * @param {number} row Visual row index.
   * @param {boolean} [snapToTop] If `true`, viewport is scrolled to show the cell on the top of the table.
   * @param {boolean} [snapToBottom] If `true`, viewport is scrolled to show the cell on the bottom of the table.
   * @returns {boolean}
   */
  scrollViewportVertically(row, snapToTop, snapToBottom) {
    if (row < 0) {
      return false;
    }

    return this.wtScroll.scrollViewportVertically(row, snapToTop, snapToBottom);
  }

  /**
   * @returns {Array}
   */
  getViewport() {
    return [
      this.wtTable.getFirstVisibleRow(),
      this.wtTable.getFirstVisibleColumn(),
      this.wtTable.getLastVisibleRow(),
      this.wtTable.getLastVisibleColumn()
    ];
  }

  /**
   * Get overlay name.
   *
   * @returns {string}
   */
  getOverlayName() {
    return this.cloneOverlay ? this.cloneOverlay.type : 'master';
  }

  /**
   * Export settings as class names added to the parent element of the table.
   */
  exportSettingsAsClassNames() {
    const toExport = {
      rowHeaders: 'htRowHeaders',
      columnHeaders: 'htColumnHeaders'
    };
    const allClassNames = [];
    const newClassNames = [];

    objectEach(toExport, (className, key) => {
      if (this.wtSettings.getSetting(key).length) {
        newClassNames.push(className);
      }
      allClassNames.push(className);
    });
    removeClass(this.wtTable.wtRootElement.parentNode, allClassNames);
    addClass(this.wtTable.wtRootElement.parentNode, newClassNames);
  }

  /**
   * @param {object} settings The singular settings to update or if passed as object to merge with.
   * @param {*} value The value to set if the first argument is passed as string.
   * @returns {Walkontable}
   */
  update(settings, value) {
    this.wtSettings.update(settings, value);

    return this;
  }

  /**
   * Get/Set Walkontable instance setting.
   *
   * @param {string} key The settings key to retrieve.
   * @param {*} [param1] Additional parameter passed to the options defined as function.
   * @param {*} [param2] Additional parameter passed to the options defined as function.
   * @param {*} [param3] Additional parameter passed to the options defined as function.
   * @param {*} [param4] Additional parameter passed to the options defined as function.
   * @returns {*}
   */
  getSetting(key, param1, param2, param3, param4) {
    return this.wtSettings.getSetting(key, param1, param2, param3, param4);
  }

  /**
   * Checks if setting exists.
   *
   * @param {string} key The settings key to check.
   * @returns {boolean}
   */
  hasSetting(key) {
    return this.wtSettings.has(key);
  }

  /**
   * Destroy instance.
   */
  destroy() {
    this.wtOverlays.destroy();
    this.wtEvent.destroy();
  }

  /**
   * Create data access object for scroll.
   *
   * @return {ScrollDao}
   */
  createScrollDao() {
      const wot  = this;
      
      return {
        get drawn(){
          return wot.drawn; // todo refactoring: consider about injecting `isDrawn` function : ()=>return wot.drawn. (it'll enables remove dao layer)
        },
        get topOverlay(){ 
          return wot.wtOverlays.topOverlay; //todo refactoring: move outside dao, use IOC
        },
        get leftOverlay(){ 
          return wot.wtOverlays.leftOverlay; //todo refactoring: move outside dao, use IOC
        },
        get wtTable(){ 
          return wot.wtTable; //todo refactoring: move outside dao, use IOC
        },
        get wtViewport(){ 
          return wot.wtViewport; //todo refactoring: move outside dao, use IOC
        },
        get rootWindow(){
          return wot.rootWindow; //todo refactoring: move outside dao
        },
        //todo refactoring, consider about using injecting wtSettings into scroll (it'll enables remove dao layer)
        get totalRows(){ 
          return wot.getSetting('totalRows');
        },
        get totalColumns(){ 
          return wot.getSetting('totalColumns');
        },
        get fixedRowsTop(){ 
          return wot.getSetting('fixedRowsTop');
        },
        get fixedRowsBottom(){ 
          return  wot.getSetting('fixedRowsBottom');
        },
        get fixedColumnsLeft(){ 
          return  wot.getSetting('fixedColumnsLeft');
        },
      
      };
  }
}
