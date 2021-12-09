---
title: 'Custom context menu in React'
metaTitle: 'Custom context menu in React - Guide - Handsontable Documentation'
permalink: /next/react-custom-context-menu-example
canonicalUrl: /react-custom-context-menu-example
---

# Custom context menu in React

## Overview

The following example is an implementation of the `@handsontable/react` component with a custom Context Menu added using React.

## Example

::: example #example1 :react
```jsx
import React from 'react';
import ReactDOM from 'react-dom';
import { HotTable } from '@handsontable/react';
import { ContextMenu } from 'handsontable/plugins/contextMenu';
import { registerAllModules } from 'handsontable/registry';
import { createSpreadsheetData } from './helpers';

// register Handsontable's modules
registerAllModules();

const hotSettings = {
  data: createSpreadsheetData(5, 5),
  colHeaders: true,
  height: 'auto',
  contextMenu: {
    items: {
      'row_above': {
        name: 'Insert row above this one (custom name)'
      },
      'row_below': {},
      'separator': ContextMenu.SEPARATOR,
      'clear_custom': {
        name: 'Clear all cells (custom)',
        callback: function() {
          this.clear();
        }
      }
    }
  },
  licenseKey: 'non-commercial-and-evaluation'
};

const App = () => {
  return (
    <div>
      <HotTable
        id="hot"
        settings={hotSettings}
      />
    </div>
  )
}

ReactDOM.render(<App />, document.getElementById('example1'));
```
