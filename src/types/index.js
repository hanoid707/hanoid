"use strict";
/**
 * 도메인 타입 모음
 * - 앱의 모든 데이터 구조가 여기 모여 있다. 화면·게임 로직·AI 엔진·DB 동기화가 전부 이 타입을 공유한다.
 * - 원본 앱(status)의 개념 → 이 앱의 타입 대응은 README의 "기능 대응표" 참고.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GHOST = exports.SYSTEM = exports.ME = void 0;
/** 플레이어(나) 작성자 ID. 캐릭터 ID와 겹치지 않게 고정 문자열을 쓴다. */
exports.ME = 'me';
/** 세계관 시스템 알림(이벤트 결과 등) 작성자 ID */
exports.SYSTEM = '__system';
/** 이름 없는 일반 유저(임시 계정)가 쓴 글·답글의 작성자 ID — 정보는 Post.ghost 에 들어 있다 */
exports.GHOST = '__ghost';
