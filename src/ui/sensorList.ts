import type SensorRegistration from '../blockchain/sensor-registration.js';
import InfoDiv from './info.js';

const clearTable = (obj: HTMLTableSectionElement) => {
  while (obj.rows.length !== 0) {
    obj.deleteRow(-1);
  }
};

const applyVisibility = (element: HTMLElement, visible: boolean) => {
  if (visible) {
    element.style.display = 'block';
  } else {
    element.style.display =  'none';
  }
}

type Option = {
  tx: SensorRegistration;
  element: HTMLOptionElement;
}

type Visibility = {
  name: boolean;
  owner: boolean;
  CPM: boolean;
  CPKB: boolean;
  broker: boolean;
  RDF: boolean;
};

class SensorList {
  private parent_: HTMLDivElement;
  private select_: HTMLSelectElement;
  private info_: HTMLDivElement;
  private infoDiv_: InfoDiv<5>;
  private RDFContainer_: HTMLDivElement;
  private RDFBody_: HTMLTableSectionElement;
  private infoOptions_: Map<string, Option>;

  constructor(visibility: Visibility) {
    this.infoOptions_ = new Map<string, Option>();

    const leftLabelDiv = document.createElement('div');
    leftLabelDiv.innerHTML = "Sensor:";

    this.select_ = document.createElement('select');
    this.select_.style.width = '100%';
    this.select_.size = 10;

    const leftSelectDiv = document.createElement('div');
    leftSelectDiv.appendChild(this.select_);

    const leftDiv = document.createElement('div');
    leftDiv.style.border = '1px';
    leftDiv.appendChild(leftLabelDiv);
    leftDiv.appendChild(leftSelectDiv);

    this.infoDiv_ = new InfoDiv(['Name: ', 'Owner: ', 'Cost Per Minute: ', 'Cost Per KB: ', 'Broker: ']);

    const rightMetadataLabel = document.createElement('div');
    rightMetadataLabel.innerHTML = 'Extra Metadata';

    const rightMetadataTable = document.createElement('table');
    rightMetadataTable.style.borderCollapse = 'collapse';
    rightMetadataTable.style.width = '100%';
    rightMetadataTable.style.tableLayout = 'fixed';

    const rightMetadataTableHead = rightMetadataTable.createTHead();
    rightMetadataTableHead.style.top = '0';
    rightMetadataTableHead.style.position = 'sticky';
    rightMetadataTableHead.style.backgroundColor = 'white';
    rightMetadataTableHead.style.zIndex = '2';

    const rightMetadataTableHeadRow = rightMetadataTableHead.insertRow();
    rightMetadataTableHeadRow.insertCell().innerHTML = 'Subject';
    rightMetadataTableHeadRow.insertCell().innerHTML = 'Predicate';
    rightMetadataTableHeadRow.insertCell().innerHTML = 'Object';

    this.RDFBody_ = rightMetadataTable.createTBody();

    const rightMetadataTableDiv = document.createElement('div');
    rightMetadataTableDiv.style.height = '50vh';
    rightMetadataTableDiv.style.overflow = 'hidden';
    rightMetadataTableDiv.style.overflowY = 'scroll';
    rightMetadataTableDiv.appendChild(rightMetadataTable);

    this.RDFContainer_ = document.createElement('div');
    this.RDFContainer_.appendChild(rightMetadataLabel);
    this.RDFContainer_.appendChild(rightMetadataTableDiv);

    this.info_ = document.createElement('div');
    this.info_.style.display = 'none';
    this.info_.appendChild(this.infoDiv_.parent());
    this.info_.appendChild(this.RDFContainer_);

    this.parent_ = document.createElement('div');
    this.parent_.style.display = 'grid';
    this.parent_.style.gridTemplateColumns = '1fr 7fr';
    this.parent_.appendChild(leftDiv);
    this.parent_.appendChild(this.info_);
    this.select_.oninput = function (parent) {
      return (_) => {
        const selected = parent.getSelected();

        if (selected === null) {
          parent.info_.style.display = 'none';
        } else {
          parent.setInfo(selected);
        }
      }
    }(this);

    this.setVisibility(visibility);
  }

  getSelected(): SensorRegistration | null {
    if (this.select_.selectedIndex === -1) {

      return null;
    }

    const selectedIndex = this.select_.selectedIndex;
    const selectedOption = this.select_.item(selectedIndex);
    return this.infoOptions_.get(selectedOption.value).tx;
  }

  parent() {
    return this.parent_;
  }

  show() {
    this.parent_.style.display = 'grid';
  }
  hide() {
    this.parent_.style.display = 'none';
  }

  setVisibility(visibility: Visibility) {
    this.infoDiv_.setVisibility([visibility.name, visibility.owner, visibility.CPM, visibility.CPKB, visibility.broker]);
    applyVisibility(this.RDFContainer_, visibility.RDF);
  }

  onNew(key: string, sensor: SensorRegistration) {
    const adding: Option = {
      tx: sensor,
      element: new Option(key,key)
    };

    this.infoOptions_.set(key, adding);
    this.select_.append(adding.element);
  }
  onDel(key: string) {
    if (this.infoOptions_.has(key)) {
      const child = this.infoOptions_.get(key);
      this.select_.removeChild(child.element);
      this.infoOptions_.delete(key);
    }
  }
  onChange(key: string, sensor: SensorRegistration) {
    if (this.infoOptions_.has(key)) {
      const child = this.infoOptions_.get(key);
      child.tx = sensor;
      if (child.element.selected) {
        this.setInfo(child.tx);
      }
    } else {
      const child: Option = {
        tx: sensor,
        element: new Option(key, key)
      };
      this.infoOptions_.set(key, child);
      this.select_.append(child.element);
    }
  }

  private setInfo(sensor: SensorRegistration) {
    this.info_.style.display = "block";
    this.infoDiv_.setValue([sensor.metadata.name, sensor.input, String(sensor.metadata.costPerMinute), String(sensor.metadata.costPerKB), sensor.metadata.integrationBroker]);
    clearTable(this.RDFBody_);
    if ("extraNodes" in sensor.metadata) {
      for (const tuple of sensor.metadata.extraNodes) {
        const dataRow = this.RDFBody_.insertRow();

        const sCell = dataRow.insertCell();
        sCell.style.border = "1px solid black";
        sCell.textContent = tuple.s;

        const pCell = dataRow.insertCell();
        pCell.style.border = "1px solid black";
        pCell.textContent = tuple.p;

        const oCell = dataRow.insertCell();
        oCell.style.border = "1px solid black";
        oCell.textContent = tuple.o;
      }
    }
    if ("extraLiterals" in sensor.metadata) {
      for (const tuple of sensor.metadata.extraLiterals) {
        const dataRow = this.RDFBody_.insertRow();

        const sCell = dataRow.insertCell();
        sCell.style.border = "1px solid black";
        sCell.textContent = tuple.s;

        const pCell = dataRow.insertCell();
        pCell.style.border = "1px solid black";
        pCell.textContent = tuple.p;

        const oCell = dataRow.insertCell();
        oCell.style.border = "1px solid black";
        oCell.textContent = String(tuple.o);
      }
    }
  }
}

export default SensorList;
export { SensorList, type Visibility };