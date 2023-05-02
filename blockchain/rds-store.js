const Stream = require("stream");
const DataFactory = require('n3').DataFactory;

//class NamedNode {
//  constructor(value) {
//    this.termType = "NamedNode";
//    this.value = value;
//  }
//  equals(term) {
//    if (typeof term === "undefined" || term === null) {
//      return false;
//    }

//    if (term.termType !== this.termType) {
//      return false;
//    }

//    return term.value === this.value;
//  }
//};

//class BlankNode {
//  constructor(value) {
//    this.termType = "BlankNode";
//    this.value = value;
//  }
//  equals(term) {
//    if (typeof term === "undefined" || term === null) {
//      return false;
//    }

//    if (term.termType !== this.termType) {
//      return false;
//    }

//    return term.value === this.value;
//  }
//};

//class Literal {
//  constructor(value, language, dataType) {
//    this.termType = "Literal";
//    this.value = value;
//    this.language = language;
//    this.dataType = dataType;
//  }

//  equals(term) {
//    if (typeof term === "undefined" || term === null) {
//      return false;
//    }

//    if (term.termType !== this.termType) {
//      return false;
//    }

//    if (term.value !== this.value) {
//      return false;
//    }

//    if (term.language !== this.language) {
//      return false;
//    }

//    return term.dataType.equals(this.dataType);
//  }
//};

//class Variable {
//  constructor(value) {
//    this.termType = "Variable";
//    this.value = value;
//  }

//  equals(term) {
//    if (typeof term === "undefined" || term === null) {
//      return false;
//    }

//    if (term.termType !== this.termType) {
//      return false;
//    }

//    return term.value === this.value;
//  }
//};

//class DefaultGraph {
//  constructor() {
//    this.termType = "DefaultGraph";
//    this.value = "";
//  }
//  equals(term) {
//    if (typeof term === "undefined" || term === null) {
//      return false;
//    }

//    return term.termType === this.termType;
//  }
//};

//function nodeUnlink(prev, next) {
//  //if next is the same as prev, we are the last link in the list
//  if (this.prev === this.next) {
//    this.prev.cleanup();
//  }

//  prev.next = next;
//  next.prev = prev;
//  prev = null;
//  next = null;
//}

//class ListNode {
//  constructor() {
//    this.next = null;
//    this.prev = null;
//    this.counter = null;
//  }

//  addAfter(node, counter) {
//    this.next = node.next;
//    this.prev = node;
//    node.next = this;
//    this.next.prev = this;
//    this.counter = counter;
//  }
//}

//class ListIterator {
//  constructor(parent) {
//    this.parent = parent;
//    this.on = this.parent.next;
//  }

//  next() {
//    if (this.on === this.parent) {
//      return {
//        done: true
//      };
//    }

//    const returning = this.on;
//    this.on = this.on.next;
//  }
//}

//class ListHead {
//  constructor(key, parentMap) {
//    this.next = this;
//    this.prev = this;
//    this.parent = parentMap;
//    this.key = key;
//  }

//  cleanup() {
//    this.parent.delete(this.key);
//  }

//  *[Symbol.iterator]() {
//    yield 1;
//    yield 2;
//    yield 3;
//  }
//}

//class Quad {
//  constructor(subject, predicate, _object, graph) {
//    this.termType = "Quad";
//    this.value = "";
//    this.subject = subject;
//    this.predicate = predicate;
//    this._object = _object;
//    this.graph = graph;

//    this.subjectNext = null;
//    this.subjectPrev = null;

//    this.predicateNext = null;
//    this.predicatePrev = null;

//    this.objectNext = null;
//    this.objectPrev = null;

//    this.graphNext = null;
//    this.graphPrev = null;

//    this.globalNext = null;
//    this.globalPrev = null;
//  }
//  equals(term) {
//    if (typeof term === "undefined" || term === null) {
//      return false;
//    }

//    if (term.termType !== this.termType) {
//      return false;
//    }

//    if (!term.subject.equals(this.subject)) {
//      return false;
//    }

//    if (!term.predicate.equals(this.predicate)) {
//      return false;
//    }

//    if (!term._object.equals(this._object)) {
//      return false;
//    }

//    if (!term.graph.equals(this.graph)) {
//      return false;
//    }

//    return true;
//  }
//  unlink() {
//    nodeUnlink(this.subjectPrev, this.subjectNext);
//    nodeUnlink(this.predicatePrev, this.predicateNext);
//    nodeUnlink(this.objectPrev, this.objectNext);
//    nodeUnlink(this.graphPrev, this.graphNext);
//  }
//};

//class DataFactory {
//  constructor() {
//    this.blankCounter = 0;
//  }
//  namedNode(value) {
//    return NamedNode(value);
//  }
//  blankNode(value) {
//    if (typeof value === "undefined") {
//      value = "blank" + this.blankCounter.toString();
//      this.blankCounter++;
//    }

//    return new BlankNode(value);
//  }
//  literal(value, languageOrDataType) {
//    if (languageOrDataType instanceof NamedNode) {
//      return new Literal(value, "", languageOrDataType);
//    } else {
//      return new Literal(value, languageOrDataType,
//        this.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#langString"));
//    }
//  }
//  variable(value) {
//    return new Variable(value);
//  }
//  defaultGraph() {
//    return new DefaultGraph();
//  }
//  quad(subject, predicate, _object, graph) {
//    if (typeof graph === "undefined" || graph === null) {
//      return new Quad(subject, predicate, _object, new DefaultGraph());
//    } else {
//      return new Quad(subject, predicate, _object, graph);
//    }
//  }
//  fromTerm(term) {
//    switch (term.termType) {
//      case "NamedNode":
//        return this.namedNode(term.value);
//      case "BlankNode":
//        return this.blankNode(term.value);
//      case "Literal":
//        return new Literal(term.value, term.language, this.fromTerm(term.dataType));
//      case "Variable":
//        return this.variable(term.value);
//      case "DefaultGraph":
//        return this.defaultGraph();
//      case "Quad":
//        return this.fromQuad(term);
//      default:
//        throw new Error("Unknown term");
//    }

//    fromQuad(quad) {
//      return this.quad(
//        this.fromTerm(term.subject),
//        this.fromTerm(term.predicate),
//        this.fromTerm(term._object),
//        this.fromTerm(term.graph));
//    }
//  }
//};

function addQuadToMap(counter, map, key, quad, toPop) {
  let quadMap = null;
  let popper = null;

  if (toPop.has(key)) {
    popper = toPop.get(key);
  } else {
    popper = {
      delete: false,
      removing: []
    };
    toPop.set(key, popper);
  }

  if (map.has(key)) {
    quadMap = map.get(key);
    popper.removing.push(counter);
  } else {
    quadMap = new Map();
    map.set(key, quadMap);
    popper.delete = true;
  }
  quadMap.set(counter, quad);
}

function popFromSource(list, map) {
  for (const [key, popper] of list) {
    if (popper.delete) {
      map.delete(key)
    } else {
      const keyMap = map.get(key);
      for (const counter of popper.removing) {
        keyMap.delete(counter);
      }
    }
  }
}

function cloneTermMap(from, to) {
  for (const [key, map] of from) {
    const adding = new Map();
    for (const [counter, quad] of map) {
      adding.set(counter, quad);
    }
    to.set(key, adding);
  }
}

class Source {
  constructor() {
    this.subjects = new Map();
    this.predicates = new Map();
    this.objects = new Map();
    this.graphs = new Map();
    this.all = [];
    this.pop = [];
    this.counter = 0;
  }

  startPush() {
    this.pop.push({
      subjects: new Map(),
      predicates: new Map(),
      objects: new Map(),
      graphs: new Map(),
      count: 0
    });
  }

  push(quad) {
    const toPop = this.pop[this.pop.length - 1];

    addQuadToMap(this.counter, this.subjects, quad.subject.value, quad, toPop.subjects);
    addQuadToMap(this.counter, this.predicates, quad.predicate.value, quad, toPop.predicates);
    addQuadToMap(this.counter, this.objects, quad._object.value, quad, toPop.objects);
    addQuadToMap(this.counter, this.graphs, quad.graph.value, quad, toPop.graphs);
    this.all.push(quad);
    toPop.count++;
    this.counter++;
  }

  pop() {
    if (this.pop.length === 0) {
      throw new Error("Nothing to pop");
    }

    const toPop = this.pop.pop();

    this.all.slice(0, -toPop.count);

    popFromSource(toPop.subjects, this.subjects);
    popFromSource(toPop.predicates, this.predicates);
    popFromSource(toPop.objects, this.objects);
    popFromSource(toPop.graphs, this.graphs);
  }

  //as we always insert at the front of the list, elements are sorted by descending insertion time,
  //which means by descending counter
  //we can then walk through each list of found nodes, only stopping on equal counters
  match(subject, predicate, _object, graph) {
    const maps = [];
    if (typeof subject !== "undefined" && subject !== null) {
      if (this.subjects.has(subject.value)) {
        maps.push(this.subjects.get(subject.value));
      } else {
        return Stream.Readable.from([]);
      }
    }
    if (typeof predicate !== "undefined" && predicate !== null) {
      if (this.predicates.has(predicate.value)) {
        maps.push(this.predicates.get(predicate.value));
      } else {
        return Stream.Readable.from([]);
      }
    }
    if (typeof _object !== "undefined" && _object !== null) {
      if (this.objects.has(_object.value)) {
        maps.push(this.objects.get(_object.value));
      } else {
        return Stream.Readable.from([]);
      }
    }
    if (typeof graph !== "undefined" && graph !== null) {
      if (this.graphs.has(graph.value)) {
        maps.push(this.graphs.get(graph.value));
      } else {
        return Stream.Readable.from([]);
      }
    }

    if (maps.length === 0) {
      return Stream.Readable.from(this.all);
    }

    const working = [];

    for (const [counter, quad] of maps[0]) {
      working.push({
        counter: counter,
        quad: quad
      });
    }

    for (let i = 1; i < maps.length; i++) {
      for (let j = 0; j < working.length;) {
        if (!maps[i].has(working[j].counter)) {
          working[j] = working[working.length - 1];
          working.pop();
        } else {
          j++
        }
      }
    }

    return Stream.Readable.from(working.map(work => work.quad));
  }

  clone() {
    const returning = new Source();

    cloneTermMap(this.subjects, returning.subjects);
    cloneTermMap(this.predicates, returning.predicates);
    cloneTermMap(this.objects, returning.objects);
    cloneTermMap(this.graphs, returning.graphs);

    this.all.forEach(item => returning.all.push(item));
    this.pop.forEach(item => returning.pop.push(item));
    returning.counter = this.counter;

    return returning;
  }

  pushInto(parent) {
    let on = 0;
    for (const toPop of this.pop) {
      parent.startPush();
      for (const quad of this.all.slice(on, on + toPop.count)) {
        parent.push(quad);
      }
      on += toPop.count;
    }
  }
};

module.exports = Source;