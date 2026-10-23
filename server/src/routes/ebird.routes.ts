import { Router } from 'express';
import type { EbirdService } from '../services/ebird.service.js';
import { parseHistoricDate, parseRegionCode, parseSpeciesCode } from '../services/validation.js';

export function createEbirdRouter(service: EbirdService, now: () => Date = () => new Date()): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', apiKeyConfigured: service.apiKeyConfigured });
  });

  router.get('/taxonomy', async (_req, res) => {
    const species = await service.getTaxonomy();
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(species);
  });

  router.get('/countries', async (_req, res) => {
    const countries = await service.getCountries();
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(countries);
  });

  router.get('/observations/recent/:region', async (req, res) => {
    const region = parseRegionCode(req.params.region);
    const species = parseSpeciesCode(req.query['species'], false);
    res.json(await service.getRecent(region, species));
  });

  router.get('/observations/historic/:region/:year/:month/:day', async (req, res) => {
    const region = parseRegionCode(req.params.region);
    const date = parseHistoricDate(req.params.year, req.params.month, req.params.day, now());
    const species = parseSpeciesCode(req.query['species'], false);
    res.json(await service.getHistoric(region, date, species));
  });

  return router;
}
