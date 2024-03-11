import fs from 'fs';

type Triple = {
  subject: string;
  predicate: string;
  object: string | number;
}

function make_triple(subject: string, predicate: string, object: string | number): Triple {
  return {
    subject: subject,
    predicate: predicate,
    object: object
  };
}

function add_count_child(map: Map<Triple, number>, key: Triple, count: number): number {
  if (map.has(key)) {
    const returning = map.get(key) + count;
    if (returning === 0) {
      map.delete(key);
    } else {
      map.set(key, returning);
    }
    return returning;
  } else {
    map.set(key, count);
    return count;
  }
}

type Triple_counts = Map<Triple, number>;

interface Source {
  add(subject: string, predicate: string, _object: string | number, count?: number): void;
  remove(subject: string, predicate: string, _object: string | number, count?: number): void;
  bulk_update(updates: Triple_counts): void;
  clone(): Source;
  finish(): void;
}

class Child_source implements Source {
  triple_counts: Triple_counts;
  parent: Source;

  constructor(parent: Source) {
    this.triple_counts = new Map<Triple, number>();
    this.parent = parent;
  }

  add(subject: string, predicate: string, _object: string | number, count?: number): void {
    if (count === undefined || count === null) {
      count = 1;
    }
    add_count_child(this.triple_counts, make_triple(subject, predicate, _object), count);
  }

  remove(subject: string, predicate: string, _object: string | number, count?: number): void {
    if (count === undefined || count === null) {
      count = 1;
    }
    add_count_child(this.triple_counts, make_triple(subject, predicate, _object), -count);
  }

  clone(): Source {
    return new Child_source(this);
  }

  bulk_update(updates: Triple_counts): void {
    for (const [triple, count] of updates) {
      add_count_child(this.triple_counts, triple, count);
    }
  }

  finish(): void {
    this.parent.bulk_update(this.triple_counts);
  }
}

class Root_source implements Source {
  fuseki_location: string;
  rollback_location: string;
  constructor(rollback_file: string, fuseki_location: string) {
    this.fuseki_location = fuseki_location;
    this.rollback_location = rollback_file;

    const current_rollback = fs.readFileSync(rollback_file, {
      encoding: 'utf8'
    });

    if (current_rollback.length !== 0) {
      //if we need to rollback, rollback
    }
  }

  add(subject: string, predicate: string, _object: string | number, count?: number): void {
    const body: string = "";
  }

  remove(subject: string, predicate: string, _object: string | number, count?: number): void {
    if (count === undefined || count === null) {
      count = 1;
    }

  }

  bulk_update(updates: Triple_counts): void {

  }

  clone(): Source {
    return new Child_source(this);
  }

  finish(): void {
  }
}


export default Root_source;

//function addQuadToMap(indices, ids, quad) {
//  if (ids.length === 1) { //base case
//    for (const index of indices) {
      
//      if (index.wildcard === null) {
//        index.wildcard = [];
//      }
//      index.wildcard.push(quad);
//      if (index.map.has(ids[0])) {
//        index.map.get(ids[0]).push(quad);
//      } else {
//        const created = [];
//        index.map.set(ids[0], created);
//        created.push(quad);
//      }
//    }
//  } else {
//    const newIndices = [];

//    for (const index of indices) {
//      if (index.wildcard === null) { //create wildcard if doesn't exist
//        index.wildcard = {
//          map: new Map(),
//          wildcard: null
//        };
//      }
//      newIndices.push(index.wildcard);
//      if (index.map.has(ids[0])) {
//        const found = index.map.get(ids[0]);
//        newIndices.push(found);
//      } else {
//        const created = {
//          map: new Map(),
//          wildcard: null
//        };
//        index.map.set(ids[0], created);
//        newIndices.push(created);
//      }
//    }
//    addQuadToMap(newIndices, ids.slice(1), quad);
//  }
//}

//function popFromSource(map, key, id) {
//  const innerMap = map.get(key);
//  if (innerMap.size === 1) {
//    innerMap.delete(id);
//  } else {
//    map.delete(key);
//  }
//}

//function cloneTermMap(from, to) {
//  for (const [key, map] of from) {
//    const adding = new Map();
//    for (const [counter, quad] of map) {
//      adding.set(counter, quad);
//    }
//    to.set(key, adding);
//  }
//}

//class Source {
//  constructor() {
//    /*
//      each is a {
//        map: value -> next
//        wildcard: wildcard
//      }
//      graph->pred->subj->obj
//    */
//    this.search = {
//      map: new Map(),
//      wildcard: {
//        map: new Map(),
//        wildcard: {
//          map: new Map(),
//          wildcard: {
//            map: new Map(),
//            wildcard: []
//          }
//        }
//      }
//    };
//    //list of prev this.all lengths to pop to
//    this.popping = [];
//    this.timeSpent = 0;
//  }

//  startPush() {
//    this.popping.push(this.search.wildcard.wildcard.wildcard.wildcard.length);
//  }

//  push(quad) {
//    addQuadToMap([this.search], [
//      quad.graph.value,
//      quad.predicate.value,
//      quad.subject.value,
//      quad._object.value],
//    quad);
//  }

//  pop() {
//    if (this.popping.length === 0) {
//      throw new Error("Nothing to pop");
//    }

//    throw new Error("NYI");
//  }

//  //as we always insert at the front of the list, elements are sorted by descending insertion time,
//  //which means by descending counter
//  //we can then walk through each list of found nodes, only stopping on equal counters
//  _matchInternal(subject, predicate, _object, graph) {
//    let on = this.search;

//    if (typeof graph === "undefined" || graph === null) {
//      on = on.wildcard;
//    } else {
//      if (on.map.has(graph.value)) {
//        on = on.map.get(graph.value);
//      } else {
//        return [];
//      }
//    }

//    if (typeof predicate === "undefined" || predicate === null) {
//      on = on.wildcard;
//    } else {
//      if (on.map.has(predicate.value)) {
//        on = on.map.get(predicate.value);
//      } else {
//        return [];
//      }
//    }

//    if (typeof subject === "undefined" || subject === null) {
//      on = on.wildcard;
//    } else {
//      if (on.map.has(subject.value)) {
//        on = on.map.get(subject.value);
//      } else {
//        return [];
//      }
//    }

//    if (typeof _object === "undefined" || _object === null) {
//      return on.wildcard;
//    } else {
//      if (on.map.has(_object.value)) {
//        return on.map.get(_object.value);
//      } else {
//        return [];
//      }
//    }
//  }

//  matchInternal(subject, predicate, _object, graph) {
//    const timeStart = process.hrtime.bigint();
//    const returning = this._matchInternal(subject, predicate, _object, graph);
//    this.timeSpent += Number(process.hrtime.bigint() - timeStart) / 1000000;
//    return returning;
//  }

//  match(subject, predicate, _object, graph) {
//    return Stream.Readable.from(this.matchInternal(subject, predicate, _object, graph));
//  }

//  countQuads(subject, predicate, _object, graph) {
//    return this.matchInternal(subject, predicate, _object, graph).length;
//  }

//  clone() {
//    const returning = new Source();

//    this.search.wildcard.wildcard.wildcard.wildcard.forEach(quad => returning.push(quad));
//    this.popping.forEach(item => returning.popping.push(item));

//    return returning;
//  }

//  pushInto(parent) {
//    let on = 0;
//    for (const toPop of this.popping.slice(1)) {
//      parent.startPush();
//      for (const quad of this.search.wildcard.wildcard.wildcard.wildcard.slice(on, on + toPop)) {
//        parent.push(quad);
//      }
//      on += toPop;
//    }
//    parent.startPush();
//    for (const quad of this.search.wildcard.wildcard.wildcard.wildcard.slice(on)) {
//      parent.push(quad);
//    }
//  }
//};