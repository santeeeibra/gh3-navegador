// test-audioworklet-60.mjs - Script de prueba para medir sincronización de AudioWorklet
// Propósito: Verificar que las notas dibujadas están sincronizadas con el audio real

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

const TEST_URL = 'http://localhost:5450';
const TEST_DURATION = 90; // segundos
const GAME_FOLDER = 'D:\\Descargas\\GH3LOR-XEX\\GH3LOR-XEX\\Guitar Hero 3 Legends of Rock';

async function runTest() {
  console.log('[TEST] Iniciando prueba de AudioWorklet sincronización...');
  console.log(`[TEST] URL: ${TEST_URL}`);
  console.log(`[TEST] Duración: ${TEST_DURATION}s`);
  console.log(`[TEST] Carpeta del juego: ${GAME_FOLDER}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--enable-features=SharedArrayBuffer']
    });

    const page = await browser.newPage();
    
    // Habilitar logging de consola del navegador
    page.on('console', msg => {
      console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
    });

    page.on('error', err => {
      console.error(`[BROWSER ERROR] ${err}`);
    });

    // Navegar a la página
    await page.goto(TEST_URL, { waitUntil: 'networkidle2' });
    console.log('[TEST] Página cargada');

    // Seleccionar carpeta del juego
    const fileInput = await page.$('#dir');
    if (!fileInput) {
      console.error('[TEST] No se encontró input #dir');
      return;
    }

    // Simular selección de archivos
    await page.evaluate((folderPath) => {
      window.testGameFolder = folderPath;
      console.log(`[TEST] Carpeta simulada: ${folderPath}`);
    }, GAME_FOLDER);

    // Esperar a que el juego inicie
    console.log('[TEST] Esperando inicio del juego...');
    await page.waitForTimeout(5000);

    // Medir tiempo de audio vs tiempo de juego cada segundo
    const measurements = [];
    for (let i = 0; i < TEST_DURATION; i++) {
      const result = await page.evaluate(() => {
        const renderer = window.gh3AudioRenderer;
        const game = window.d4;
        
        if (!renderer || !game) {
          return null;
        }

        return {
          audioTime: renderer.getTime?.(),
          gameTime: game.songLast?.t,
          isActive: renderer.isActive?.(),
          timestamp: performance.now()
        };
      });

      if (result) {
        measurements.push(result);
        const lag = result.audioTime - result.gameTime;
        console.log(`[${i}s] Audio: ${result.audioTime?.toFixed(2)}s | Game: ${result.gameTime?.toFixed(2)}s | Lag: ${lag?.toFixed(3)}s`);
      }

      await page.waitForTimeout(1000);
    }

    // Calcular estadísticas
    const lags = measurements
      .filter(m => m.audioTime && m.gameTime)
      .map(m => m.audioTime - m.gameTime);

    if (lags.length > 0) {
      const avgLag = lags.reduce((a, b) => a + b, 0) / lags.length;
      const maxLag = Math.max(...lags);
      const minLag = Math.min(...lags);
      
      console.log('\n[RESULTADO]');
      console.log(`  Mediciones: ${lags.length}`);
      console.log(`  Lag promedio: ${avgLag.toFixed(3)}s`);
      console.log(`  Lag máximo: ${maxLag.toFixed(3)}s`);
      console.log(`  Lag mínimo: ${minLag.toFixed(3)}s`);
      
      if (avgLag < 0.1) {
        console.log('  ✅ APROBADO: Desfase < 100ms');
      } else {
        console.log('  ⚠️  ADVERTENCIA: Desfase > 100ms');
      }
    } else {
      console.log('[TEST] No se pudieron recolectar mediciones');
    }

    await browser.close();
  } catch (err) {
    console.error('[TEST ERROR]', err);
    if (browser) await browser.close();
  }
}

runTest().catch(console.error);
