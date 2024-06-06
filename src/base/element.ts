import type * as CSS from "csstype";
import type { JSDOM } from "jsdom";

import { NewEffect } from "../library/signal";
import { GetValue, StaticFinal, Final, GetFlatValue } from "../library/value";

import diff from "../library/diff";
import { isNotNil } from "ramda";

type LifecycleEvents = {
  type: "add" | "remove";
  target: Node;
};

export type Events = Event | LifecycleEvents;

export type Styles = CSS.Properties;

export type Attributes = Final<
  Partial<{
    [key: string]: Final<any>;
    styles?: Final<Styles>;
    events?: (events: Events) => void;
  }>
>;

export type ElementFunctionGroup = {
  NewElement: <T extends keyof (HTMLElementTagNameMap & SVGElementTagNameMap)>(
    tag: StaticFinal<T>,
    attributes?: Attributes,
    ...children: Final<any>[]
  ) => Element;

  SetElementAttribute: (element: StaticFinal<Element>, attributes?: Attributes) => Element;

  AddElement: (parent: StaticFinal<Element>, ...children: Final<any>[]) => Element;

  UpdateElement: (target: StaticFinal<Element>, source: StaticFinal<Element>) => Element;

  WatchRootElement: (rootElement: StaticFinal<Element>, callback?: (event: Events) => any) => Element;
};

export const GetElementFunctionGroup = (window: Window | JSDOM["window"]) => {
  const _: ElementFunctionGroup = {
    NewElement(tag, attributes, ...children) {
      const element = window.document.createElement(GetValue(tag));
      _.SetElementAttribute(element, attributes);
      _.AddElement(element, ...children);
      return element;
    },

    SetElementAttribute(element, attributes) {
      const _element = GetValue(element);

      NewEffect(() => {
        const _attributes = GetValue(attributes);

        for (const key in _attributes) {
          NewEffect(() => {
            if (!["styles", "events"].includes(key)) _element.setAttribute(key, _attributes[GetValue(key)]);
          });
        }

        NewEffect(() => {
          const _styles = GetValue(_attributes?.styles);
          if (_element instanceof (HTMLElement || SVGElement)) Object.assign(_element.style, _styles);
        });

        _element.addEventListener("receive", (event) => {
          _attributes?.events?.(
            // @ts-ignore
            event.detail.data
          );
        });
      });

      return _element;
    },

    AddElement(parent, ...children) {
      const _parent = GetValue(parent);

      const createdTime = performance.now() + performance.now();
      const start = window.document.createComment("s-" + createdTime) as Node;
      const end = window.document.createComment("e-" + createdTime) as Node;
      _parent.append(start, end);

      const GetStartIndex = () => Array.from(_parent.childNodes).findIndex((e) => e === start);
      const GetEndIndex = () => Array.from(_parent.childNodes).findIndex((e) => e === end);

      const cache: { [key: string]: Node } = {};
      NewEffect(() => {
        const newKeys: string[] = [];
        const flatChildren = [
          start,
          ...(GetFlatValue(children)
            .filter((v) => isNotNil(v))
            .map((v) => {
              if (v instanceof Node) {
                return v;
              } else {
                const string = String(v);
                if (cache[string]) {
                  return cache[string];
                } else {
                  const node = window.document.createTextNode(v);
                  newKeys.push(string);
                  cache[string] = node;
                  return node;
                }
              }
            }) as Node[]),
          end,
        ];

        Object.keys(cache).forEach((key) => {
          if (!newKeys.includes(key)) {
            delete cache[key];
          }
        });

        diff(_parent, Array.from(_parent.childNodes).slice(GetStartIndex(), GetEndIndex() + 1), flatChildren, (node /*, action*/) => {
          // if (action === 1) console.info(action, node);
          return node;
        });
      });
      return _parent;
    },

    // RemoveElement(parent, ...children) {
    //   const _parent = GetValue(parent);
    //   children.forEach((child) => _parent.removeChild(GetValue(child)));
    // },

    UpdateElement(target, source) {
      const _source = GetValue(source);
      GetValue(target).replaceWith(_source);
      return _source;
    },

    WatchRootElement(rootElement, callback) {
      const _rootElement = GetValue(rootElement);
      Object.keys(window).forEach((key) => {
        if (key.startsWith("on")) {
          const _key = key.slice(2).toLowerCase();
          try {
            _rootElement.addEventListener(
              _key,
              (event) => {
                event.target?.dispatchEvent(new CustomEvent("receive", { detail: { data: event } }));
                callback?.(event);
              },
              {
                passive: ["wheel", "mousewheel", "touchstart", "touchmove"].includes(_key) ? true : false,
              }
            );
          } catch (error) {}
        }
      });
      new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node: Node) => {
            const data: LifecycleEvents = { type: "add", target: node };
            node.dispatchEvent(
              new CustomEvent("receive", {
                detail: {
                  data: data,
                },
              })
            );
            callback?.(data);
          });
          mutation.removedNodes.forEach((node: Node) => {
            const data: LifecycleEvents = { type: "remove", target: node };
            node.dispatchEvent(
              new CustomEvent("receive", {
                detail: {
                  data: data,
                },
              })
            );
            callback?.(data);
          });
        });
      }).observe(_rootElement, {
        childList: true,
        subtree: true,
      });
      return _rootElement;
    },
  };
  return {
    ..._,
    ne: _.NewElement,
    sea: _.SetElementAttribute,
    ae: _.AddElement,
    ue: _.UpdateElement,
    wre: _.WatchRootElement,
  };
};
