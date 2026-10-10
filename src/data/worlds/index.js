"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORLDS = void 0;
exports.getWorldTemplate = getWorldTemplate;
exports.findSeed = findSeed;
exports.sceneKey = sceneKey;
const cyberpunk_1 = require("./cyberpunk");
const football_1 = require("./football");
const influencer_1 = require("./influencer");
const military_1 = require("./military");
const office_1 = require("./office");
const youtuber_1 = require("./youtuber");
exports.WORLDS = [cyberpunk_1.CYBERPUNK, football_1.FOOTBALL, office_1.OFFICE, military_1.MILITARY, youtuber_1.YOUTUBER, influencer_1.INFLUENCER];
function getWorldTemplate(id) {
    if (!id)
        return undefined;
    return exports.WORLDS.find((w) => w.id === id);
}
/** 캐릭터 ID('ch_키') → 세계관 원본 설정 */
function findSeed(templateId, characterId) {
    const w = getWorldTemplate(templateId);
    if (!w || !characterId.startsWith('ch_'))
        return undefined;
    const key = characterId.slice(3);
    return w.cast.find((c) => c.key === key);
}
/** 세계관 장면 사진 키(src/data/photos.ts의 SCENES 키) */
function sceneKey(worldId, key) {
    return `${worldId}__${key}`;
}
