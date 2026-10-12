import { Routes } from '@angular/router';
import { AddressAliases } from './address-aliases';
import { NewAlias } from './new-alias';
import { ImportAliases } from './import-aliases';
import { DomainAliases } from './domain-aliases';
import { NewDomainAlias } from './new-domain-alias';
import { PatternRewrites } from './pattern-rewrites';
import { NewPatternRewrite } from './new-pattern-rewrite';
import { Catchall } from './catchall';
import { BccCaptures } from './bcc-captures';
import { NewBccCapture } from './new-bcc-capture';

export const ROUTES: Routes = [
  { path: 'aliases', component: AddressAliases, title: 'Address aliases · Amelu' },
  { path: 'aliases/new', component: NewAlias, title: 'New alias · Amelu' },
  { path: 'aliases/import', component: ImportAliases, title: 'Import aliases · Amelu' },
  { path: 'domain-aliases', component: DomainAliases, title: 'Domain aliases · Amelu' },
  { path: 'domain-aliases/new', component: NewDomainAlias, title: 'New domain alias · Amelu' },
  { path: 'rewrites', component: PatternRewrites, title: 'Pattern rewrites · Amelu' },
  { path: 'rewrites/new', component: NewPatternRewrite, title: 'New pattern rewrite · Amelu' },
  { path: 'catchall', component: Catchall, title: 'Catch-all recipient · Amelu' },
  { path: 'bccs', component: BccCaptures, title: 'Bcc. captures · Amelu' },
  { path: 'bccs/new', component: NewBccCapture, title: 'New Bcc. capture · Amelu' },
];
