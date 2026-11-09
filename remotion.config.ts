import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(85);
Config.setOverwriteOutput(true);
Config.setConcurrency(2);
Config.setX264Preset('veryfast');
Config.setTimeoutInMilliseconds(120000);
Config.setChromiumDisableWebSecurity(true);
