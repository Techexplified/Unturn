/// <reference types="@shopify/app-bridge-types" />

declare module "*.css";

declare namespace JSX {
  interface IntrinsicElements {
    "s-app-nav": any;
    "s-link": any;
    "s-page": any;
    "s-button": any;
    "s-section": any;
    "s-paragraph": any;
    "s-stack": any;
    "s-unordered-list": any;
    "s-list-item": any;
  }
}
