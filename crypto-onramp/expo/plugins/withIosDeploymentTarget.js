const { withPodfile } = require('@expo/config-plugins');

const defaultDeploymentTarget = '15.1';
const deploymentTargetSetting = 'minimum_deployment_target =';

module.exports = function withIosDeploymentTarget(config) {
  return withPodfile(config, (config) => {
    // Xcode 27 no longer builds targets whose iOS deployment target is below
    // 15.0. Some CocoaPods dependencies, including AsyncStorage, still declare
    // an older minimum in their podspec. CocoaPods applies that value to the
    // dependency's resource-bundle target even though the app and generated
    // Podfile already target iOS 15.1, causing the Xcode build to fail.
    //
    // Raise generated Pod targets below the app's deployment target in the
    // standard post_install hook, while preserving dependencies that require a
    // newer iOS version. Keeping this in an Expo config plugin rather than
    // editing ios/Podfile directly ensures it survives `expo prebuild --clean`.
    // This workaround can be removed once all dependencies used by the example
    // declare an iOS deployment target supported by current Xcode.
    if (config.modResults.contents.includes(deploymentTargetSetting)) {
      return config;
    }

    const postInstallEnd = '    )\n  end\nend';
    const deploymentTargetOverride = `    )

    minimum_deployment_target = podfile_properties['ios.deploymentTarget'] || '${defaultDeploymentTarget}'

    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current_deployment_target = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current_deployment_target.nil? || Gem::Version.new(current_deployment_target) < Gem::Version.new(minimum_deployment_target)
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum_deployment_target
        end
      end
    end
  end
end`;

    if (!config.modResults.contents.includes(postInstallEnd)) {
      throw new Error('Unable to configure the iOS deployment target in the Podfile');
    }

    config.modResults.contents = config.modResults.contents.replace(
      postInstallEnd,
      deploymentTargetOverride,
    );
    return config;
  });
};
