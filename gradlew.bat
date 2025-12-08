@rem
@rem Copyright 2011 the original author or authors.
@rem
@rem Licensed under the Apache License, Version 2.0 (the "License");
@rem you may not use this file except in compliance with the License.
@rem You may obtain a copy of the License at
@rem
@rem      http://www.apache.org/licenses/LICENSE-2.0
@rem
@rem Unless required by applicable law or agreed to in writing, software
@rem distributed under the License is distributed on an "AS IS" BASIS,
@rem WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
@rem See the License for the specific language governing permissions and
@rem limitations under the License.
@rem

@if "%DEBUG%" == "" @echo off
@rem ##########################################################################
@rem
@rem  Gradle startup script for Windows
@rem
@rem ##########################################################################

@rem Set local scope for the variables with windows 9x (command.com) compatibility
if "%OS%"=="Windows_NT" setlocal

@rem Add default JVM options here. You can also use JAVA_OPTS and GRADLE_OPTS to pass JVM options to this script.
set DEFAULT_JVM_OPTS=-Xmx64m

:findJava
if defined JAVA_HOME goto javaFound
set JAVA_HOME=
@rem Check to see if the JVM is available on the PATH
where java >NUL 2>&1
if "%ERRORLEVEL%"=="0" goto javaFound
echo.
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.
goto fail

:javaFound
@rem Determine the Java command to use
if defined JAVA_HOME (
  set _JAVACMD="%JAVA_HOME%\bin\java.exe"
) else (
  set _JAVACMD="java"
)

:init
@rem Determine the script directory
set APP_HOME=%~dp0

@rem Find Gradle wrapper jar - we assume it's always one level down from the root dir in the standard location
set CLASSPATH=%APP_HOME%gradle\wrapper\gradle-wrapper.jar

@rem Execute Gradle
"%_JAVACMD%" %DEFAULT_JVM_OPTS% -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*

:end
@rem End local scope for the variables with windows 9x (command.com) compatibility
if "%OS%"=="Windows_NT" endlocal

:fail
exit /b 1
