type Tuple<T, N extends number> = N extends N ? number extends N ? T[] : _TupleOf<T, N, []> : never;
type _TupleOf<T, N extends number, R extends unknown[]> = R['length'] extends N ? R : _TupleOf<T, N, [T, ...R]>;


class Info {
  private label_: HTMLSpanElement;
  private value_: HTMLInputElement;

  constructor(name: string, parent: HTMLDivElement) {
    this.label_ = document.createElement('span');
    this.label_.innerHTML = name;

    this.value_ = document.createElement('input');
    this.value_.disabled = true;

    parent.appendChild(this.label_);
    parent.appendChild(this.value_);
  }

  setValue(val: string) {
    this.value_.value = val;
  }

  hide() {
    this.label_.hidden = true;
    this.value_.hidden = true;
  }
  show() {
    this.label_.hidden = false;
    this.value_.hidden = false;
  }
}


class InfoDiv<N extends number> {
  private infos_: Tuple<Info,N>;
  private parent_: HTMLDivElement;

  constructor(names: Tuple<string, N>) {
    this.parent_ = document.createElement('div');
    this.parent_.style.display = 'grid';
    this.parent_.style.gridTemplateColumns = 'auto 1fr';

    this.infos_ = [] as Tuple<Info, N>; //we cheat here as we will make it 'legit' later with the for loop
    for (let i = 0; i < names.length; ++i) {
      this.infos_.push(new Info(names[i], this.parent_));
    }
  }

  setValue(vals: Tuple<string, N>) {
    if (vals.length !== this.infos_.length) {
      throw new Error("Visibility length doesn't match infos length");
    }

    for (let i = 0; i < vals.length; ++i) {
      this.infos_[i].setValue(vals[i]);
    }
  }

  parent() {
    return this.parent_;
  }

  setVisibility(visibility: Tuple<boolean, N>) {
    if (visibility.length !== this.infos_.length) {
      throw new Error("Visibility length doesn't match infos length");
    }

    for (let i = 0; i < visibility.length; ++i) {
      if (visibility[i]) {
        this.infos_[i].show();
      } else {
        this.infos_[i].hide();
      }
    }
  }
}

export default InfoDiv;