/**
 * @file canvas-box-ids.ts
 * @description P1621: the test ids of the controls focus returns to (a box's title, its Add card), named once so the code that closes an editor and the box that draws the control agree.
 */
export const boxTitleTestId = (tag: string): string => `canvas-box-title-${tag}`;
export const boxAddTestId = (tag: string): string => `canvas-box-add-${tag}`;
