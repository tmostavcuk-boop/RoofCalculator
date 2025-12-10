#!/usr/bin/env sh

##############################################################################
##
##  Gradle start up script for POSIX compatible systems
##
##############################################################################

# For help, see http://www.gradle.org/
usage() {
  echo "Usage: gradlew [option...] [task...]"
}

# Determine the Java command to use to start the JVM.
if [ -n "$JAVA_HOME" ] ; then
    if [ -x "$JAVA_HOME/jre/sh/java" ] ; then
        # IBM's JDK on AIX uses "$JAVA_HOME/jre/sh/java" as the system java executable
        JAVACMD="$JAVA_HOME/jre/sh/java"
    else
        JAVACMD="$JAVA_HOME/bin/java"
    fi
    if [ ! -x "$JAVACMD" ] ; then
        die "ERROR: JAVA_HOME is set to an invalid directory: $JAVA_HOME

Please set the JAVA_HOME variable in your environment to match the
location of your Java installation."
    fi
else
    JAVACMD="java"
    which java >/dev/null 2>&1 || die "ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.

Please set the JAVA_HOME variable in your environment to match the
location of your Java installation."
fi

# Determine the script directory
PRG="$0"
while [ -h "$PRG" ]; do
    ls=`ls -ld "$PRG"`
    link=`expr "$ls" : '.*-> \(.*\)$'`
    if expr "$link" : '/.*' > /dev/null; then
        PRG="$link"
    else
        PRG=`dirname "$PRG"`/"$link"
    fi
done
APP_HOME=`dirname "$PRG"`

# Determine the classpath for the startup script
APP_HOME=`cd "$APP_HOME" && pwd`
if [ -f "$APP_HOME/gradle/wrapper/gradle-wrapper.jar" ] ; then
    CLASSPATH="$APP_HOME/gradle/wrapper/gradle-wrapper.jar"
else
    die "ERROR: Cannot find $APP_HOME/gradle/wrapper/gradle-wrapper.jar
This might indicate a corrupted or incomplete installation.
Please redownload the wrapper files from your project's repository."
fi

# Execute Gradle
exec "$JAVACMD" $DEFAULT_JVM_OPTS -classpath "$CLASSPATH" org.gradle.wrapper.GradleWrapperMain "$@"
